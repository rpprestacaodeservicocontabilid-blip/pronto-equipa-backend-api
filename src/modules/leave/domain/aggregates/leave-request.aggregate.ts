import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { ValidationError } from '../../../../shared/errors/app.error';
import {
  ApprovalDecision,
  LeaveApproval,
  LeaveApprovalProps,
} from '../entities/leave-approval.entity';
import {
  LeaveRequestPeriod,
  LeaveRequestPeriodProps,
} from '../entities/leave-request-period.entity';
import { SelfApprovalForbiddenError } from '../errors/leave.error';
import { LeaveEvent } from '../events/leave.event';
import { LeaveDays } from '../value-objects/leave-days.vo';
import { LeavePeriod } from '../value-objects/leave-period.vo';
import { LeaveStatus, canTransitionLeave, isLeaveStatus } from '../value-objects/leave-status.vo';
import { InvalidLeaveTransitionError } from '../errors/leave.error';

export const LEAVE_TYPES = ['ANNUAL', 'SICK', 'SPECIAL', 'UNPAID', 'OTHER'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export interface LeaveRequestProps {
  id: string;
  companyId: number;
  employeeId: string;
  accountId: string;
  leaveType: LeaveType;
  status: LeaveStatus;
  reason: string | null;
  /** Σ dos dias calculados dos períodos. */
  requestedDays: number;
  /** Menor startDate / maior endDate dos períodos — para índices. */
  startDate: string;
  endDate: string;
  submittedAt: Date | null;
  decidedAt: Date | null;
  createdByUserId: number;
  /** Versão para bloqueio optimista (RN-004 / RNF-004). */
  version: number;
  periods: LeaveRequestPeriodProps[];
  approvals: LeaveApprovalProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLeaveRequestInput {
  companyId: number;
  employeeId: string;
  accountId: string;
  leaveType?: LeaveType;
  reason?: string | null;
  createdByUserId: number;
  /** Segmentos com a duração já calculada pelo calendário. */
  segments: Array<{ startDate: string; endDate: string; calculatedDays: number }>;
  now?: Date;
}

/**
 * Pedido de férias — raiz de agregado do ciclo de vida
 * (secção 5 da especificação).
 *
 * O agregado mantém os segmentos e as decisões junto do pedido,
 * garantindo que as transições respeitam a máquina de estados e
 * que a versão evita aprovações concorrentes.
 */
export class LeaveRequest extends AggregateRoot<LeaveRequestProps> {
  private constructor(props: LeaveRequestProps) {
    super(props);
  }

  static create(input: CreateLeaveRequestInput): LeaveRequest {
    if (!Number.isSafeInteger(input.companyId) || input.companyId <= 0) {
      throw new ValidationError('A valid company context is required.');
    }
    if (!Number.isSafeInteger(input.createdByUserId) || input.createdByUserId <= 0) {
      throw new ValidationError('A leave request requires a creator.');
    }
    if (!input.segments || input.segments.length === 0) {
      throw new ValidationError('A leave request requires at least one period.');
    }
    if (input.leaveType && !(LEAVE_TYPES as readonly string[]).includes(input.leaveType)) {
      throw new ValidationError('Unknown leave type.');
    }

    const now = input.now ?? new Date();
    const id = randomUUID();
    const periods = input.segments.map((segment) => {
      const period = LeavePeriod.create(segment.startDate, segment.endDate);
      // RN-016: a duração tem de ser coerente com o calendário.
      if (segment.calculatedDays <= 0) {
        throw new ValidationError('Leave periods must contain working days.');
      }
      if (segment.calculatedDays > period.calendarDays) {
        throw new ValidationError('Calculated leave days cannot exceed calendar days.');
      }
      LeaveDays.create(segment.calculatedDays);
      return LeaveRequestPeriod.create({
        companyId: input.companyId,
        requestId: id,
        startDate: segment.startDate,
        endDate: segment.endDate,
        calculatedDays: segment.calculatedDays,
      });
    });

    // Sobreposição ENTRE os próprios segmentos do pedido (RN-017).
    for (let i = 0; i < periods.length; i += 1) {
      for (let j = i + 1; j < periods.length; j += 1) {
        const left = LeavePeriod.create(periods[i].props.startDate, periods[i].props.endDate);
        const right = LeavePeriod.create(periods[j].props.startDate, periods[j].props.endDate);
        if (left.overlaps(right)) {
          throw new ValidationError('Leave periods inside one request cannot overlap.');
        }
      }
    }

    const ordered = [...periods].sort((a, b) => (a.props.startDate < b.props.startDate ? -1 : 1));
    const requestedDays = periods.reduce((total, period) => total + period.props.calculatedDays, 0);
    LeaveDays.create(requestedDays);

    const request = new LeaveRequest({
      id,
      companyId: input.companyId,
      employeeId: input.employeeId,
      accountId: input.accountId,
      leaveType: input.leaveType ?? 'ANNUAL',
      status: 'DRAFT',
      reason: input.reason?.trim() || null,
      requestedDays,
      startDate: ordered[0].props.startDate,
      endDate: ordered[ordered.length - 1].props.endDate,
      submittedAt: null,
      decidedAt: null,
      createdByUserId: input.createdByUserId,
      version: 1,
      periods: ordered.map((period) => ({ ...period.props })),
      approvals: [],
      createdAt: now,
      updatedAt: now,
    });

    request.record(
      new LeaveEvent({
        eventName: 'leave.request.created',
        occurredAt: now,
        aggregateId: id,
        companyId: input.companyId,
        payload: {
          requestId: id,
          employeeId: input.employeeId,
          requestedDays,
          startDate: request.props.startDate,
          endDate: request.props.endDate,
        },
      }),
    );

    return request;
  }

  static restore(props: LeaveRequestProps): LeaveRequest {
    if (!isLeaveStatus(props.status)) {
      throw new ValidationError('Invalid leave request status.');
    }
    return new LeaveRequest(props);
  }

  get id(): string {
    return this.props.id;
  }

  get companyId(): number {
    return this.props.companyId;
  }

  get employeeId(): string {
    return this.props.employeeId;
  }

  get accountId(): string {
    return this.props.accountId;
  }

  get status(): LeaveStatus {
    return this.props.status;
  }

  get version(): number {
    return this.props.version;
  }

  get requestedDays(): number {
    return this.props.requestedDays;
  }

  get startDate(): string {
    return this.props.startDate;
  }

  get endDate(): string {
    return this.props.endDate;
  }

  get createdByUserId(): number {
    return this.props.createdByUserId;
  }

  get periods(): ReadonlyArray<LeaveRequestPeriodProps> {
    return this.props.periods;
  }

  get approvals(): ReadonlyArray<LeaveApprovalProps> {
    return this.props.approvals;
  }

  get propsSnapshot(): LeaveRequestProps {
    return {
      ...this.props,
      periods: [...this.props.periods],
      approvals: [...this.props.approvals],
    };
  }

  /** Verifica a versão esperada antes de qualquer escrita (optimistic lock). */
  assertVersion(expectedVersion: number): void {
    if (this.props.version !== expectedVersion) {
      throw new InvalidLeaveTransitionError(
        `version ${expectedVersion}`,
        `version ${this.props.version}`,
      );
    }
  }

  /** Transição de estado validada pela máquina (secção 5). */
  transition(to: LeaveStatus, now: Date = new Date()): LeaveRequestProps {
    if (!canTransitionLeave(this.props.status, to)) {
      throw new InvalidLeaveTransitionError(this.props.status, to);
    }
    this.props.status = to;
    this.props.version += 1;
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  submit(now: Date = new Date()): LeaveRequestProps {
    if (this.props.status !== 'DRAFT' && this.props.status !== 'RETURNED') {
      throw new InvalidLeaveTransitionError(this.props.status, 'PENDING_APPROVAL');
    }
    const props = this.transition('PENDING_APPROVAL', now);
    this.props.submittedAt = now;
    this.emit('leave.request.submitted', now, {
      requestId: this.props.id,
      requestedDays: this.props.requestedDays,
    });
    return props;
  }

  /** Regista a decisão e transiciona (RN-031). */
  decide(
    decision: ApprovalDecision,
    approverUserId: number,
    comments: string | null,
    now: Date = new Date(),
  ): LeaveRequestProps {
    const target: LeaveStatus =
      decision === 'APPROVED' ? 'APPROVED' : decision === 'REJECTED' ? 'REJECTED' : 'RETURNED';

    const approval = LeaveApproval.create({
      companyId: this.props.companyId,
      requestId: this.props.id,
      approverUserId,
      decision,
      comments,
      now,
    });
    this.props.approvals.push({ ...approval.props });
    const props = this.transition(target, now);
    if (target !== 'RETURNED') this.props.decidedAt = now;
    const eventByDecision: Record<ApprovalDecision, string> = {
      APPROVED: 'leave.request.approved',
      REJECTED: 'leave.request.rejected',
      RETURNED: 'leave.request.returned',
    };
    this.emit(eventByDecision[decision], now, {
      approverUserId,
      requestedDays: this.props.requestedDays,
    });
    return props;
  }

  /**
   * RN-030 / CA-030: o criador não pode aprovar o próprio pedido
   * (auto-aprovação proibida por omissão do módulo).
   */
  assertNotSelfApproval(actorUserId: number, allowSelfApproval = false): void {
    if (!allowSelfApproval && this.props.createdByUserId === actorUserId) {
      throw new SelfApprovalForbiddenError();
    }
  }

  /**
   * RF-016: actualiza um pedido em DRAFT — tipo, motivo e/ou
   * novos segmentos (durações já calculadas pelo calendário).
   */
  updateDraft(
    changes: {
      leaveType?: LeaveType;
      reason?: string | null;
      segments?: Array<{ startDate: string; endDate: string; calculatedDays: number }>;
    },
    now: Date = new Date(),
  ): LeaveRequestProps {
    if (this.props.status !== 'DRAFT') {
      throw new InvalidLeaveTransitionError(this.props.status, 'DRAFT_EDIT');
    }
    if (changes.leaveType !== undefined) {
      if (!(LEAVE_TYPES as readonly string[]).includes(changes.leaveType)) {
        throw new ValidationError('Unknown leave type.');
      }
      this.props.leaveType = changes.leaveType;
    }
    if (changes.reason !== undefined) {
      this.props.reason = changes.reason?.trim() || null;
    }
    if (changes.segments?.length) {
      this.rebuildPeriods(changes.segments, now);
    }
    this.props.version += 1;
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  /** RF-042: confirma o início do período de férias. */
  start(now: Date = new Date()): LeaveRequestProps {
    const props = this.transition('IN_PROGRESS', now);
    this.emit('leave.request.started', now, { requestedDays: this.props.requestedDays });
    return props;
  }

  /** RF-021 / RN-020: cancela o pedido (a reserva é libertada pela infraestrutura). */
  cancel(now: Date = new Date()): LeaveRequestProps {
    const previousStatus = this.props.status;
    const props = this.transition('CANCELLED', now);
    this.emit('leave.request.cancelled', now, { previousStatus });
    return props;
  }

  /** RF-045: interrupção autorizada — os dias afectados ficam registados à parte. */
  interrupt(now: Date = new Date()): LeaveRequestProps {
    const props = this.transition('INTERRUPTED', now);
    this.emit('leave.request.interrupted', now, { requestedDays: this.props.requestedDays });
    return props;
  }

  /** §10.2: conclusão — a infraestrutura converte a reserva em utilização. */
  complete(now: Date = new Date()): LeaveRequestProps {
    const props = this.transition('COMPLETED', now);
    this.emit('leave.request.completed', now, { requestedDays: this.props.requestedDays });
    return props;
  }

  /** Reagendamento: novos segmentos, recálculo e actualização (§10.3). */
  reschedule(
    segments: Array<{ startDate: string; endDate: string; calculatedDays: number }>,
    now: Date = new Date(),
  ): LeaveRequestProps {
    if (!['APPROVED', 'IN_PROGRESS'].includes(this.props.status)) {
      throw new InvalidLeaveTransitionError(this.props.status, 'RESCHEDULED');
    }
    if (!segments.length) {
      throw new ValidationError('Rescheduling requires at least one period.');
    }
    this.rebuildPeriods(segments, now);
    this.props.version += 1;
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  /** Substitui os segmentos e recalcula os agregados do pedido. */
  private rebuildPeriods(
    segments: Array<{ startDate: string; endDate: string; calculatedDays: number }>,
    now: Date,
  ): void {
    const periods = segments.map((segment) => {
      LeavePeriod.create(segment.startDate, segment.endDate);
      if (segment.calculatedDays <= 0) {
        throw new ValidationError('Leave periods must contain working days.');
      }
      LeaveDays.create(segment.calculatedDays);
      return LeaveRequestPeriod.create({
        companyId: this.props.companyId,
        requestId: this.props.id,
        startDate: segment.startDate,
        endDate: segment.endDate,
        calculatedDays: segment.calculatedDays,
      });
    });

    // Sem sobreposição ENTRE os próprios segmentos (RN-017).
    for (let i = 0; i < periods.length; i += 1) {
      for (let j = i + 1; j < periods.length; j += 1) {
        const left = LeavePeriod.create(periods[i].props.startDate, periods[i].props.endDate);
        const right = LeavePeriod.create(periods[j].props.startDate, periods[j].props.endDate);
        if (left.overlaps(right)) {
          throw new ValidationError('Leave periods inside one request cannot overlap.');
        }
      }
    }

    const ordered = [...periods].sort((a, b) => (a.props.startDate < b.props.startDate ? -1 : 1));
    const requestedDays = periods.reduce((total, period) => total + period.props.calculatedDays, 0);
    LeaveDays.create(requestedDays);

    this.props.periods = ordered.map((period) => ({ ...period.props }));
    this.props.requestedDays = requestedDays;
    this.props.startDate = ordered[0].props.startDate;
    this.props.endDate = ordered[ordered.length - 1].props.endDate;
    this.props.updatedAt = now;
  }

  private emit(eventName: string, occurredAt: Date, payload: Record<string, unknown>): void {
    this.record(
      new LeaveEvent({
        eventName,
        occurredAt,
        aggregateId: this.props.id,
        companyId: this.props.companyId,
        payload: { requestId: this.props.id, ...payload },
      }),
    );
  }
}
