import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import type { IdempotencyStore } from '../../../../shared/application/idempotency';
import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/errors/app.error';
import { LeaveRequestProps } from '../../domain/aggregates/leave-request.aggregate';
import {
  LeaveNotFoundError,
  LeavePeriodOverlapError,
  SelfApprovalForbiddenError,
} from '../../domain/errors/leave.error';
import { LeaveRepository, LeaveRequestListQuery } from '../../domain/repositories/leave.repository';
import { LeaveWorkUnit } from '../../domain/repositories/leave-work-unit';
import { LeaveDaysCalculator } from '../../domain/services/leave-days-calculator.service';
import { BLOCKING_LEAVE_STATUSES } from '../../domain/value-objects/leave-status.vo';
import { ContractReader } from '../ports/contract-reader.port';
import { EmployeeReader } from '../ports/employee-reader.port';
import { WorkCalendarReader } from '../ports/work-calendar-reader.port';

type ActorInput = { companyId: number; actorUserId: number };
type SegmentInput = { startDate: string; endDate: string };

/** Transições críticas que aceitam `Idempotency-Key`. */
type IdempotentAction<T> = ActorInput & { id?: string; idempotencyKey?: string } & T;

/**
 * Caso de uso do CICLO DE VIDA dos pedidos de férias
 * (RF-013..045 da especificação).
 *
 * Responsabilidades:
 *   - validar trabalhador, contrato activo e calendário laboral;
 *   - calcular a duração útil de cada segmento (RN-016);
 *   - submeter com verificação de sobreposições (RN-017);
 *   - aprovar/rejeitar/devolver com política anti-auto-aprovação;
 *   - idempotência em approve/complete/cancel (`Idempotency-Key`);
 *   - auditoria best-effort depois de cada operação confirmada.
 *
 * A atomicidade transaccional (saldo bloqueado, outbox) vive na
 * `LeaveWorkUnit` — este caso de uso orquestra e audita.
 */
export class ManageLeaveRequestsUseCase {
  constructor(
    private readonly repository: LeaveRepository,
    private readonly workUnit: LeaveWorkUnit,
    private readonly employees: EmployeeReader,
    private readonly contracts: ContractReader,
    private readonly calendars: WorkCalendarReader,
    private readonly audit: AuditRecorderPort,
    private readonly idempotency: IdempotencyStore,
    private readonly allowSelfApproval = false,
  ) {}

  // ----------------------------------------------------------
  // Criação e rascunho
  // ----------------------------------------------------------

  /**
   * RF-013/017: cria o pedido em DRAFT.
   *
   * A duração de cada segmento é calculada com o calendário
   * laboral efectivo; exige trabalhador activo e contrato que
   * cubra o período (RN-003/006).
   */
  async create(
    input: ActorInput & {
      employeeId: string;
      leaveType?: string;
      reason?: string | null;
      segments: SegmentInput[];
    },
  ): Promise<LeaveRequestProps> {
    const employee = await this.employees.findActive(input.companyId, input.employeeId);
    if (!employee) throw new NotFoundError('Employee');

    const segments = await this.calculateSegments(
      input.companyId,
      input.employeeId,
      input.segments,
    );

    // Contrato activo cobrindo o intervalo inteiro (RN-006).
    const { startDate } = input.segments[0];
    const last = input.segments[input.segments.length - 1];
    const contract = await this.contracts.findActiveCovering(
      input.companyId,
      input.employeeId,
      startDate,
      last.endDate,
    );
    if (!contract) {
      throw new ValidationError('No active contract covers the requested leave period.');
    }

    // Conta por trabalhador — criada sob demanda (RF-001).
    let account = await this.repository.findAccountByEmployee(input.companyId, input.employeeId);
    if (!account) {
      account = await this.workUnit.createAccount({
        companyId: input.companyId,
        employeeId: input.employeeId,
        actorUserId: input.actorUserId,
      });
      await this.audit.record({
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        action: 'leave.account_created',
        entityType: 'leave_account',
        entityId: account.id,
        after: { employeeId: account.employeeId, status: account.status },
      });
    }

    const created = await this.workUnit.createRequest({
      companyId: input.companyId,
      employeeId: input.employeeId,
      accountId: account.id,
      leaveType: input.leaveType,
      reason: input.reason,
      segments,
      actorUserId: input.actorUserId,
    });

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'leave.request_created',
      entityType: 'leave_request',
      entityId: created.id,
      after: {
        employeeId: created.employeeId,
        leaveType: created.leaveType,
        requestedDays: created.requestedDays,
        startDate: created.startDate,
        endDate: created.endDate,
      },
    });
    return created;
  }

  /** RF-016: actualiza um pedido em DRAFT (revalida durações). */
  async updateDraft(
    input: ActorInput & {
      id: string;
      expectedVersion: number;
      leaveType?: string;
      reason?: string | null;
      segments?: SegmentInput[];
    },
  ): Promise<LeaveRequestProps> {
    const existing = await this.requireRequest(input.companyId, input.id);

    let segments: Array<{ startDate: string; endDate: string; calculatedDays: number }> | undefined;
    if (input.segments?.length) {
      segments = await this.calculateSegments(input.companyId, existing.employeeId, input.segments);
    }

    const updated = await this.workUnit.updateDraftRequest({
      companyId: input.companyId,
      requestId: input.id,
      expectedVersion: input.expectedVersion,
      leaveType: input.leaveType,
      reason: input.reason,
      segments,
      actorUserId: input.actorUserId,
    });

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'leave.request_draft_updated',
      entityType: 'leave_request',
      entityId: input.id,
      after: { version: updated.version, requestedDays: updated.requestedDays },
    });
    return updated;
  }

  // ----------------------------------------------------------
  // Submissão e decisões
  // ----------------------------------------------------------

  /** RF-020: submete para aprovação — valida sobreposições (RN-017). */
  async submit(input: ActorInput & { id: string; expectedVersion: number }) {
    const existing = await this.requireRequest(input.companyId, input.id);
    await this.assertNoOverlap(
      input.companyId,
      existing.employeeId,
      existing.periods.map((period) => ({
        startDate: period.startDate,
        endDate: period.endDate,
      })),
      input.id,
    );

    const updated = await this.workUnit.submitRequest({
      companyId: input.companyId,
      requestId: input.id,
      expectedVersion: input.expectedVersion,
      actorUserId: input.actorUserId,
    });

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'leave.request_submitted',
      entityType: 'leave_request',
      entityId: input.id,
      after: { status: updated.status, requestedDays: updated.requestedDays },
    });
    return updated;
  }

  /**
   * RF-025: aprova e reserva o saldo (RN-018 revalida dentro da
   * transacção). Auto-aprovação proibida por omissão (CA-030).
   * Aceita `Idempotency-Key`.
   */
  async approve(
    input: IdempotentAction<{
      id: string;
      expectedVersion: number;
      comments?: string | null;
    }>,
  ) {
    return this.withIdempotency(input.idempotencyKey, async () => {
      const existing = await this.requireRequest(input.companyId, input.id);
      this.assertNotSelfApproval(existing.createdByUserId, input.actorUserId);

      const updated = await this.workUnit.approveRequest({
        companyId: input.companyId,
        requestId: input.id,
        expectedVersion: input.expectedVersion,
        comments: input.comments,
        actorUserId: input.actorUserId,
        allowSelfApproval: this.allowSelfApproval,
      });

      await this.audit.record({
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        action: 'leave.request_approved',
        entityType: 'leave_request',
        entityId: input.id,
        after: { status: updated.status, requestedDays: updated.requestedDays },
      });
      return updated;
    });
  }

  /** RF-026 / RN-019: rejeita com justificação — não consome saldo. */
  async reject(input: ActorInput & { id: string; expectedVersion: number; comments: string }) {
    const existing = await this.requireRequest(input.companyId, input.id);
    this.assertNotSelfApproval(existing.createdByUserId, input.actorUserId);
    if (!input.comments?.trim()) {
      throw new ValidationError('Rejections require a justification.');
    }

    const updated = await this.workUnit.rejectRequest({
      companyId: input.companyId,
      requestId: input.id,
      expectedVersion: input.expectedVersion,
      comments: input.comments,
      actorUserId: input.actorUserId,
      allowSelfApproval: this.allowSelfApproval,
    });

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'leave.request_rejected',
      entityType: 'leave_request',
      entityId: input.id,
      after: { status: updated.status, comments: input.comments },
    });
    return updated;
  }

  /** RF-027: devolve o pedido para correcção do requerente. */
  async returnRequest(
    input: ActorInput & { id: string; expectedVersion: number; comments?: string | null },
  ) {
    const existing = await this.requireRequest(input.companyId, input.id);
    this.assertNotSelfApproval(existing.createdByUserId, input.actorUserId);

    const updated = await this.workUnit.returnRequest({
      companyId: input.companyId,
      requestId: input.id,
      expectedVersion: input.expectedVersion,
      comments: input.comments,
      actorUserId: input.actorUserId,
      allowSelfApproval: this.allowSelfApproval,
    });

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'leave.request_returned',
      entityType: 'leave_request',
      entityId: input.id,
      after: { status: updated.status },
    });
    return updated;
  }

  // ----------------------------------------------------------
  // Cancelamento, reagendamento e execução
  // ----------------------------------------------------------

  /** RF-021 / RN-020: cancela e liberta a reserva. Aceita `Idempotency-Key`. */
  async cancel(input: IdempotentAction<{ id: string; expectedVersion: number }>) {
    return this.withIdempotency(input.idempotencyKey, async () => {
      await this.requireRequest(input.companyId, input.id);

      const updated = await this.workUnit.cancelRequest({
        companyId: input.companyId,
        requestId: input.id,
        expectedVersion: input.expectedVersion,
        actorUserId: input.actorUserId,
      });

      await this.audit.record({
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        action: 'leave.request_cancelled',
        entityType: 'leave_request',
        entityId: input.id,
        after: { status: updated.status },
      });
      return updated;
    });
  }

  /** RF-022: reagenda preservando o histórico e ajustando reservas. */
  async reschedule(
    input: ActorInput & {
      id: string;
      expectedVersion: number;
      segments: SegmentInput[];
    },
  ) {
    const existing = await this.requireRequest(input.companyId, input.id);
    const segments = await this.calculateSegments(
      input.companyId,
      existing.employeeId,
      input.segments,
    );

    const { startDate } = input.segments[0];
    const last = input.segments[input.segments.length - 1];
    const contract = await this.contracts.findActiveCovering(
      input.companyId,
      existing.employeeId,
      startDate,
      last.endDate,
    );
    if (!contract) {
      throw new ValidationError('No active contract covers the rescheduled leave period.');
    }

    await this.assertNoOverlap(input.companyId, existing.employeeId, input.segments, input.id);

    const updated = await this.workUnit.rescheduleRequest({
      companyId: input.companyId,
      requestId: input.id,
      expectedVersion: input.expectedVersion,
      segments,
      actorUserId: input.actorUserId,
    });

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'leave.request_rescheduled',
      entityType: 'leave_request',
      entityId: input.id,
      after: {
        startDate: updated.startDate,
        endDate: updated.endDate,
        requestedDays: updated.requestedDays,
        version: updated.version,
      },
    });
    return updated;
  }

  /** RF-042: confirma o início do período de férias. */
  async start(input: ActorInput & { id: string; expectedVersion: number }) {
    await this.requireRequest(input.companyId, input.id);
    const updated = await this.workUnit.startRequest({
      companyId: input.companyId,
      requestId: input.id,
      expectedVersion: input.expectedVersion,
      actorUserId: input.actorUserId,
    });
    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'leave.request_started',
      entityType: 'leave_request',
      entityId: input.id,
      after: { status: updated.status },
    });
    return updated;
  }

  /** RF-045: regista interrupção autorizada com motivo. */
  async interrupt(
    input: ActorInput & {
      id: string;
      expectedVersion: number;
      startDate: string;
      endDate: string;
      reason: string;
    },
  ) {
    await this.requireRequest(input.companyId, input.id);
    if (!input.reason?.trim()) {
      throw new ValidationError('An interruption requires a reason.');
    }
    const updated = await this.workUnit.interruptRequest({
      companyId: input.companyId,
      requestId: input.id,
      expectedVersion: input.expectedVersion,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason,
      actorUserId: input.actorUserId,
    });
    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'leave.request_interrupted',
      entityType: 'leave_request',
      entityId: input.id,
      after: { status: updated.status, startDate: input.startDate, endDate: input.endDate },
    });
    return updated;
  }

  /**
   * §10.2: conclui convertendo a reserva em utilização sem dupla
   * contabilização. Aceita `Idempotency-Key`.
   */
  async complete(
    input: IdempotentAction<{ id: string; expectedVersion: number; usedDays?: number }>,
  ) {
    return this.withIdempotency(input.idempotencyKey, async () => {
      await this.requireRequest(input.companyId, input.id);
      const updated = await this.workUnit.completeRequest({
        companyId: input.companyId,
        requestId: input.id,
        expectedVersion: input.expectedVersion,
        usedDays: input.usedDays,
        actorUserId: input.actorUserId,
      });
      await this.audit.record({
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        action: 'leave.request_completed',
        entityType: 'leave_request',
        entityId: input.id,
        after: { status: updated.status, requestedDays: updated.requestedDays },
      });
      return updated;
    });
  }

  // ----------------------------------------------------------
  // Consultas
  // ----------------------------------------------------------

  async get(companyId: number, id: string): Promise<LeaveRequestProps> {
    return this.requireRequest(companyId, id);
  }

  list(companyId: number, query: LeaveRequestListQuery) {
    return this.repository.listRequests(companyId, query);
  }

  /** Histórico: segmentos + decisões (RN-031 / RF-031). */
  async history(companyId: number, id: string) {
    await this.requireRequest(companyId, id);
    return this.repository.getRequestHistory(companyId, id);
  }

  // ----------------------------------------------------------
  // Privados
  // ----------------------------------------------------------

  private async requireRequest(companyId: number, id: string): Promise<LeaveRequestProps> {
    const request = await this.repository.findRequest(companyId, id);
    if (!request) throw new LeaveNotFoundError('Leave request');
    return request;
  }

  private assertNotSelfApproval(createdByUserId: number, actorUserId: number): void {
    if (!this.allowSelfApproval && createdByUserId === actorUserId) {
      throw new SelfApprovalForbiddenError();
    }
  }

  /** Calcula a duração útil de cada segmento com o calendário (RN-016). */
  private async calculateSegments(
    companyId: number,
    employeeId: string,
    segments: SegmentInput[],
  ): Promise<Array<{ startDate: string; endDate: string; calculatedDays: number }>> {
    if (!segments?.length) {
      throw new ValidationError('A leave request requires at least one period.');
    }

    const calendar = await this.calendars.getCalendar(
      companyId,
      segments[0].startDate,
      segments[segments.length - 1].endDate,
    );
    const calculator = new LeaveDaysCalculator(calendar);

    return segments.map((segment) => ({
      startDate: segment.startDate,
      endDate: segment.endDate,
      calculatedDays: calculator.countWorkingDays(segment.startDate, segment.endDate),
    }));
  }

  /** RN-017: nenhum segmento pode sobrepor-se a pedido comprometido. */
  private async assertNoOverlap(
    companyId: number,
    employeeId: string,
    segments: ReadonlyArray<{ startDate: string; endDate: string }>,
    excludeRequestId?: string,
  ): Promise<void> {
    for (const segment of segments) {
      const overlaps = await this.repository.findOverlappingPeriods(
        companyId,
        employeeId,
        segment.startDate,
        segment.endDate,
        excludeRequestId,
      );
      const blocking = overlaps.filter((period) =>
        (BLOCKING_LEAVE_STATUSES as readonly string[]).includes(period.status),
      );
      if (blocking.length > 0) {
        throw new LeavePeriodOverlapError(blocking[0].requestId);
      }
    }
  }

  /**
   * Envolvente de idempotência (fluxo find → claim → execute →
   * complete/release) para approve/complete/cancel.
   */
  private async withIdempotency<T>(key: string | undefined, run: () => Promise<T>): Promise<T> {
    if (!key) return run();

    const existing = await this.idempotency.find<T>(key);
    if (existing?.status === 'completed' && existing.response !== undefined) {
      return existing.response;
    }

    const claimed = await this.idempotency.claim(key);
    if (!claimed) {
      throw new ConflictError('An operation with this Idempotency-Key is already in progress.');
    }

    try {
      const response = await run();
      await this.idempotency.complete(key, response);
      return response;
    } catch (error) {
      await this.idempotency.release(key);
      throw error;
    }
  }
}
