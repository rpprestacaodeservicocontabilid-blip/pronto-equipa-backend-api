import { Op, QueryTypes, Transaction, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import { ConflictError, ValidationError } from '../../../../../shared/errors/app.error';
import { DomainEvent } from '../../../../../shared/domain/domain-event';
import { EmployeeModel } from '../../../../employees/infrastructure/persistence/models/employee.model';
import {
  LeaveAccount,
  LeaveAccountProps,
} from '../../../domain/aggregates/leave-account.aggregate';
import {
  LeaveRequest,
  LeaveRequestProps,
  LeaveType,
} from '../../../domain/aggregates/leave-request.aggregate';
import { LeaveBalanceMovement } from '../../../domain/entities/leave-balance-movement.entity';
import { LeaveEntitlement } from '../../../domain/entities/leave-entitlement.entity';
import { LeaveInterruption } from '../../../domain/entities/leave-interruption.entity';
import {
  InsufficientBalanceError,
  LeaveAccountExistsError,
  LeaveAlreadyReconciledError,
  LeaveNotFoundError,
  LeavePeriodOverlapError,
  InvalidLeaveTransitionError,
} from '../../../domain/errors/leave.error';
import { LeaveEvent } from '../../../domain/events/leave.event';
import { LeaveWorkUnit } from '../../../domain/repositories/leave-work-unit';
import { LeaveBalance } from '../../../domain/value-objects/leave-balance.vo';
import { LeaveMovementType } from '../../../domain/value-objects/leave-balance.vo';
import {
  BLOCKING_LEAVE_STATUSES,
  RESERVED_LEAVE_STATUSES,
} from '../../../domain/value-objects/leave-status.vo';
import { LeaveAccountModel } from '../models/leave-account.model';
import { LeaveApprovalModel } from '../models/leave-approval.model';
import { LeaveBalanceMovementModel } from '../models/leave-balance-movement.model';
import { LeaveEntitlementModel } from '../models/leave-entitlement.model';
import { LeaveInterruptionModel } from '../models/leave-interruption.model';
import { LeaveOutboxModel } from '../models/leave-outbox.model';
import { LeaveRequestModel } from '../models/leave-request.model';
import { LeaveRequestPeriodModel } from '../models/leave-request-period.model';

// ============================================================
// Helpers de persistência
// ============================================================

const dateOnly = (value: unknown): string => String(value).slice(0, 10);

/**
 * Executa a operação numa transacção com o contexto de tenant.
 *
 * Em PostgreSQL define `app.current_tenant` para as policies RLS
 * (defesa em profundidade — o filtro por `companyId` da aplicação
 * continua a ser obrigatório). Em SQLite/MySQL é só transacção.
 */
const withTenant = async <T>(
  companyId: number,
  operation: (transaction: Transaction) => Promise<T>,
): Promise<T> =>
  sequelize.transaction(async (transaction) => {
    if (sequelize.getDialect() === 'postgres') {
      await sequelize.query("SELECT set_config('app.current_tenant', :companyId, true)", {
        replacements: { companyId: String(companyId) },
        type: QueryTypes.SELECT,
        transaction,
      });
    }
    return operation(transaction);
  });

const mapRequestRow = (row: LeaveRequestModel): LeaveRequestProps => ({
  id: row.id,
  companyId: row.companyId,
  employeeId: row.employeeId,
  accountId: row.accountId,
  leaveType: row.leaveType as LeaveType,
  status: row.status as LeaveRequestProps['status'],
  reason: row.reason,
  requestedDays: row.requestedDays,
  startDate: dateOnly(row.startDate),
  endDate: dateOnly(row.endDate),
  submittedAt: row.submittedAt,
  decidedAt: row.decidedAt,
  createdByUserId: row.createdByUserId,
  version: row.version,
  periods: [],
  approvals: [],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * Implementação transaccional da porta `LeaveWorkUnit`.
 *
 * Invariantes garantidas AQUI (e não no controlador):
 *   - cada operação é uma transacção única com tenant aplicado;
 *   - o pedido e a conta são bloqueados (`FOR UPDATE`) nas
 *     operações que tocam ao saldo (RN-018 / CA-008/009);
 *   - sobreposições e saldo são REVALIDADOS dentro da transacção;
 *   - os eventos de domínio vão para `leave_outbox` na mesma
 *     transacção (outbox transaccional);
 *   - `version` é verificada em todas as escritas (optimistic lock).
 */
export class SequelizeLeaveWorkUnit implements LeaveWorkUnit {
  // ----------------------------------------------------------
  // Contas e direitos
  // ----------------------------------------------------------

  async createAccount(input: {
    companyId: number;
    employeeId: string;
    actorUserId: number;
  }): Promise<LeaveAccountProps> {
    return withTenant(input.companyId, async (transaction) => {
      const employee = await EmployeeModel.findOne({
        where: { id: input.employeeId, companyId: input.companyId },
        transaction,
      });
      if (!employee) throw new LeaveNotFoundError('Employee');

      const existing = await LeaveAccountModel.findOne({
        where: { companyId: input.companyId, employeeId: input.employeeId },
        transaction,
      });
      if (existing) throw new LeaveAccountExistsError();

      const account = LeaveAccount.create({
        companyId: input.companyId,
        employeeId: input.employeeId,
      });

      try {
        await LeaveAccountModel.create(
          {
            id: account.id,
            companyId: account.companyId,
            employeeId: account.employeeId,
            status: account.status,
            version: account.version,
          },
          { transaction },
        );
      } catch (error) {
        if (error instanceof UniqueConstraintError) throw new LeaveAccountExistsError();
        throw error;
      }

      await this.writeOutbox(transaction, input.companyId, account.pullDomainEvents());
      return account.propsSnapshot;
    });
  }

  async accrueEntitlement(input: {
    companyId: number;
    accountId: string;
    accrualPeriodStart: string;
    accrualPeriodEnd: string;
    days: number;
    legalRuleVersionId?: string | null;
    actorUserId: number;
  }): Promise<{ entitlementId: string; movementId: number }> {
    return withTenant(input.companyId, async (transaction) => {
      const account = await this.lockAccount(input.companyId, input.accountId, transaction);

      const entitlement = LeaveEntitlement.create({
        companyId: input.companyId,
        accountId: input.accountId,
        accrualPeriodStart: input.accrualPeriodStart,
        accrualPeriodEnd: input.accrualPeriodEnd,
        days: input.days,
        legalRuleVersionId: input.legalRuleVersionId,
      });

      try {
        await LeaveEntitlementModel.create(
          {
            id: entitlement.props.id,
            companyId: input.companyId,
            accountId: input.accountId,
            accrualPeriodStart: input.accrualPeriodStart,
            accrualPeriodEnd: input.accrualPeriodEnd,
            days: input.days,
            legalRuleVersionId: input.legalRuleVersionId ?? null,
          },
          { transaction },
        );
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          throw new ConflictError('An entitlement already exists for this accrual period.');
        }
        throw error;
      }

      const movementId = await this.insertMovement(transaction, {
        companyId: input.companyId,
        accountId: input.accountId,
        entitlementId: entitlement.props.id,
        movementType: 'ACCRUAL',
        days: input.days,
        actorUserId: input.actorUserId,
      });

      await this.writeOutbox(transaction, input.companyId, [
        new LeaveEvent({
          eventName: 'leave.entitlement_accrued',
          aggregateId: entitlement.props.id,
          companyId: input.companyId,
          payload: {
            accountId: account.id,
            entitlementId: entitlement.props.id,
            days: input.days,
            accrualPeriodStart: input.accrualPeriodStart,
            accrualPeriodEnd: input.accrualPeriodEnd,
          },
        }),
      ]);

      return { entitlementId: entitlement.props.id, movementId };
    });
  }

  async adjustBalance(input: {
    companyId: number;
    accountId: string;
    days: number;
    reason: string;
    referenceId?: string | null;
    actorUserId: number;
  }): Promise<{ movementId: number }> {
    return withTenant(input.companyId, async (transaction) => {
      await this.lockAccount(input.companyId, input.accountId, transaction);

      const movementId = await this.insertMovement(transaction, {
        companyId: input.companyId,
        accountId: input.accountId,
        movementType: 'ADJUSTMENT',
        days: input.days,
        reason: input.reason,
        referenceId: input.referenceId,
        actorUserId: input.actorUserId,
      });

      await this.writeOutbox(transaction, input.companyId, [
        new LeaveEvent({
          eventName: 'leave.balance_adjusted',
          aggregateId: input.accountId,
          companyId: input.companyId,
          payload: {
            accountId: input.accountId,
            days: input.days,
            reason: input.reason,
            movementId,
          },
        }),
      ]);

      return { movementId };
    });
  }

  async recalculateEntitlements(input: {
    companyId: number;
    accountId: string;
    accrualPeriodStart: string;
    accrualPeriodEnd: string;
    days: number;
    legalRuleVersionId?: string | null;
    actorUserId: number;
  }): Promise<{ entitlementId: string; adjustmentDays: number }> {
    return withTenant(input.companyId, async (transaction) => {
      await this.lockAccount(input.companyId, input.accountId, transaction);

      const existing = await LeaveEntitlementModel.findOne({
        where: {
          companyId: input.companyId,
          accountId: input.accountId,
          accrualPeriodStart: input.accrualPeriodStart,
          accrualPeriodEnd: input.accrualPeriodEnd,
        },
        transaction,
      });

      // RN-008: direitos consolidados nunca são alterados — a
      // diferença torna-se um movimento ADJUSTMENT auditável.
      if (existing) {
        const delta = input.days - existing.days;
        if (delta === 0) return { entitlementId: existing.id, adjustmentDays: 0 };

        const movementId = await this.insertMovement(transaction, {
          companyId: input.companyId,
          accountId: input.accountId,
          entitlementId: existing.id,
          movementType: 'ADJUSTMENT',
          days: delta,
          reason: `Entitlement recalculation for ${input.accrualPeriodStart}..${input.accrualPeriodEnd}`,
          actorUserId: input.actorUserId,
        });

        await this.writeOutbox(transaction, input.companyId, [
          new LeaveEvent({
            eventName: 'leave.entitlement_recalculated',
            aggregateId: existing.id,
            companyId: input.companyId,
            payload: {
              accountId: input.accountId,
              entitlementId: existing.id,
              previousDays: existing.days,
              newDays: input.days,
              adjustmentDays: delta,
              movementId,
            },
          }),
        ]);

        return { entitlementId: existing.id, adjustmentDays: delta };
      }

      const entitlement = LeaveEntitlement.create({
        companyId: input.companyId,
        accountId: input.accountId,
        accrualPeriodStart: input.accrualPeriodStart,
        accrualPeriodEnd: input.accrualPeriodEnd,
        days: input.days,
        legalRuleVersionId: input.legalRuleVersionId,
      });
      await LeaveEntitlementModel.create(
        {
          id: entitlement.props.id,
          companyId: input.companyId,
          accountId: input.accountId,
          accrualPeriodStart: input.accrualPeriodStart,
          accrualPeriodEnd: input.accrualPeriodEnd,
          days: input.days,
          legalRuleVersionId: input.legalRuleVersionId ?? null,
        },
        { transaction },
      );
      await this.insertMovement(transaction, {
        companyId: input.companyId,
        accountId: input.accountId,
        entitlementId: entitlement.props.id,
        movementType: 'ACCRUAL',
        days: input.days,
        actorUserId: input.actorUserId,
      });

      return { entitlementId: entitlement.props.id, adjustmentDays: input.days };
    });
  }

  // ----------------------------------------------------------
  // Pedidos — criação e rascunho
  // ----------------------------------------------------------

  async createRequest(input: {
    companyId: number;
    employeeId: string;
    accountId: string;
    leaveType?: string;
    reason?: string | null;
    segments: Array<{ startDate: string; endDate: string; calculatedDays: number }>;
    actorUserId: number;
  }): Promise<LeaveRequestProps> {
    return withTenant(input.companyId, async (transaction) => {
      const account = await LeaveAccountModel.findOne({
        where: {
          id: input.accountId,
          companyId: input.companyId,
          employeeId: input.employeeId,
        },
        transaction,
      });
      if (!account) throw new LeaveNotFoundError('Leave account');

      const request = LeaveRequest.create({
        companyId: input.companyId,
        employeeId: input.employeeId,
        accountId: input.accountId,
        leaveType: input.leaveType as LeaveType | undefined,
        reason: input.reason,
        createdByUserId: input.actorUserId,
        segments: input.segments,
      });

      const props = request.propsSnapshot;
      await LeaveRequestModel.create(
        {
          id: props.id,
          companyId: props.companyId,
          employeeId: props.employeeId,
          accountId: props.accountId,
          leaveType: props.leaveType,
          status: props.status,
          reason: props.reason,
          requestedDays: props.requestedDays,
          startDate: props.startDate,
          endDate: props.endDate,
          submittedAt: props.submittedAt,
          decidedAt: props.decidedAt,
          createdByUserId: props.createdByUserId,
          version: props.version,
          createdAt: props.createdAt,
          updatedAt: props.updatedAt,
        },
        { transaction },
      );
      await this.syncPeriods(transaction, props.companyId, props.id, props.periods);
      await this.writeOutbox(transaction, input.companyId, request.pullDomainEvents());

      return props;
    });
  }

  async updateDraftRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    leaveType?: string;
    reason?: string | null;
    segments?: Array<{ startDate: string; endDate: string; calculatedDays: number }>;
    actorUserId: number;
  }): Promise<LeaveRequestProps> {
    return withTenant(input.companyId, async (transaction) => {
      const request = await this.loadAggregate(input.companyId, input.requestId, transaction);
      request.assertVersion(input.expectedVersion);

      const props = request.updateDraft(
        {
          leaveType: input.leaveType as LeaveType | undefined,
          reason: input.reason,
          segments: input.segments,
        },
        new Date(),
      );

      await this.saveRequest(transaction, props);
      if (input.segments?.length) {
        await this.syncPeriods(transaction, props.companyId, props.id, props.periods);
      }
      return props;
    });
  }

  // ----------------------------------------------------------
  // Pedidos — submissão e decisões
  // ----------------------------------------------------------

  async submitRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    actorUserId: number;
  }): Promise<LeaveRequestProps> {
    return withTenant(input.companyId, async (transaction) => {
      const request = await this.loadAggregate(input.companyId, input.requestId, transaction);
      request.assertVersion(input.expectedVersion);

      // RN-017 revalidado DENTRO da transacção (fonte autoritativa).
      for (const period of request.periods) {
        const conflict = await this.findBlockingConflict(
          input.companyId,
          request.employeeId,
          period.startDate,
          period.endDate,
          request.id,
          transaction,
        );
        if (conflict) throw new LeavePeriodOverlapError(conflict);
      }

      const props = request.submit(new Date());
      await this.saveRequest(transaction, props);
      await this.writeOutbox(transaction, input.companyId, request.pullDomainEvents());
      return props;
    });
  }

  async approveRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    comments?: string | null;
    actorUserId: number;
    allowSelfApproval?: boolean;
  }): Promise<LeaveRequestProps> {
    return withTenant(input.companyId, async (transaction) => {
      const request = await this.loadAggregate(input.companyId, input.requestId, transaction);
      request.assertVersion(input.expectedVersion);
      request.assertNotSelfApproval(input.actorUserId, input.allowSelfApproval ?? false);

      if (request.status !== 'PENDING_APPROVAL') {
        throw new InvalidLeaveTransitionError(request.status, 'APPROVED');
      }

      // RN-017: sobreposições revalidadas na transacção.
      for (const period of request.periods) {
        const conflict = await this.findBlockingConflict(
          input.companyId,
          request.employeeId,
          period.startDate,
          period.endDate,
          request.id,
          transaction,
        );
        if (conflict) throw new LeavePeriodOverlapError(conflict);
      }

      // RN-018 / CA-008: saldo revalidado com a conta BLOQUEADA.
      const account = await this.lockAccount(input.companyId, request.accountId, transaction);
      if (account.status !== 'ACTIVE') {
        throw new ValidationError('Leave account is not active.');
      }
      const balance = await this.balanceOf(input.companyId, request.accountId, transaction);
      if (!balance.canCover(request.requestedDays)) {
        throw new InsufficientBalanceError(balance.available, request.requestedDays);
      }

      const props = request.decide(
        'APPROVED',
        input.actorUserId,
        input.comments ?? null,
        new Date(),
      );

      // Reserva do saldo (negativa) — libertada no cancelamento,
      // convertida em utilização na conclusão (§10.2).
      await this.insertMovement(transaction, {
        companyId: input.companyId,
        accountId: request.accountId,
        movementType: 'RESERVATION',
        days: -request.requestedDays,
        referenceId: request.id,
        actorUserId: input.actorUserId,
      });

      await this.saveRequest(transaction, props);
      await this.insertNewApprovals(transaction, props);
      await this.writeOutbox(transaction, input.companyId, request.pullDomainEvents());
      return props;
    });
  }

  async rejectRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    comments: string;
    actorUserId: number;
    allowSelfApproval?: boolean;
  }): Promise<LeaveRequestProps> {
    return withTenant(input.companyId, async (transaction) => {
      const request = await this.loadAggregate(input.companyId, input.requestId, transaction);
      request.assertVersion(input.expectedVersion);
      request.assertNotSelfApproval(input.actorUserId, input.allowSelfApproval ?? false);

      // A entidade `LeaveApproval` exige justificação (RN-026).
      const props = request.decide('REJECTED', input.actorUserId, input.comments, new Date());

      await this.saveRequest(transaction, props);
      await this.insertNewApprovals(transaction, props);
      await this.writeOutbox(transaction, input.companyId, request.pullDomainEvents());
      return props;
    });
  }

  async returnRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    comments?: string | null;
    actorUserId: number;
    allowSelfApproval?: boolean;
  }): Promise<LeaveRequestProps> {
    return withTenant(input.companyId, async (transaction) => {
      const request = await this.loadAggregate(input.companyId, input.requestId, transaction);
      request.assertVersion(input.expectedVersion);
      request.assertNotSelfApproval(input.actorUserId, input.allowSelfApproval ?? false);

      const props = request.decide(
        'RETURNED',
        input.actorUserId,
        input.comments ?? null,
        new Date(),
      );

      await this.saveRequest(transaction, props);
      await this.insertNewApprovals(transaction, props);
      await this.writeOutbox(transaction, input.companyId, request.pullDomainEvents());
      return props;
    });
  }

  // ----------------------------------------------------------
  // Pedidos — cancelamento e reagendamento
  // ----------------------------------------------------------

  async cancelRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    actorUserId: number;
  }): Promise<LeaveRequestProps> {
    return withTenant(input.companyId, async (transaction) => {
      const request = await this.loadAggregate(input.companyId, input.requestId, transaction);
      request.assertVersion(input.expectedVersion);

      // Guarda ANTES da transição: apenas estados reservados têm
      // saldo a libertar (RN-020).
      const wasReserved = (RESERVED_LEAVE_STATUSES as readonly string[]).includes(request.status);

      if (wasReserved) {
        await this.assertNotReconciled(input.companyId, request.id, ['RELEASE'], transaction);
      }

      const props = request.cancel(new Date());

      if (wasReserved) {
        await this.insertMovement(transaction, {
          companyId: input.companyId,
          accountId: request.accountId,
          movementType: 'RELEASE',
          days: request.requestedDays,
          referenceId: request.id,
          actorUserId: input.actorUserId,
        });
      }

      await this.saveRequest(transaction, props);
      await this.writeOutbox(transaction, input.companyId, request.pullDomainEvents());
      return props;
    });
  }

  async rescheduleRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    segments: Array<{ startDate: string; endDate: string; calculatedDays: number }>;
    actorUserId: number;
  }): Promise<LeaveRequestProps> {
    return withTenant(input.companyId, async (transaction) => {
      const request = await this.loadAggregate(input.companyId, input.requestId, transaction);
      request.assertVersion(input.expectedVersion);

      const previousDays = request.requestedDays;
      const now = new Date();
      const props = request.reschedule(input.segments, now);
      const delta = props.requestedDays - previousDays;

      // Sobreposição dos NOVOS períodos com outros pedidos (RN-017).
      for (const period of props.periods) {
        const conflict = await this.findBlockingConflict(
          input.companyId,
          request.employeeId,
          period.startDate,
          period.endDate,
          request.id,
          transaction,
        );
        if (conflict) throw new LeavePeriodOverlapError(conflict);
      }

      if (delta !== 0) {
        // A reserva original existe nos estados elegíveis ao reagendar.
        await this.lockAccount(input.companyId, request.accountId, transaction);
        if (delta > 0) {
          const balance = await this.balanceOf(input.companyId, request.accountId, transaction);
          if (!balance.canCover(delta)) {
            throw new InsufficientBalanceError(balance.available, delta);
          }
          await this.insertMovement(transaction, {
            companyId: input.companyId,
            accountId: request.accountId,
            movementType: 'RESERVATION',
            days: -delta,
            referenceId: request.id,
            actorUserId: input.actorUserId,
          });
        } else {
          await this.insertMovement(transaction, {
            companyId: input.companyId,
            accountId: request.accountId,
            movementType: 'RELEASE',
            days: Math.abs(delta),
            referenceId: request.id,
            actorUserId: input.actorUserId,
          });
        }
      }

      await this.saveRequest(transaction, props);
      await this.syncPeriods(transaction, props.companyId, props.id, props.periods);
      await this.writeOutbox(transaction, input.companyId, request.pullDomainEvents());
      return props;
    });
  }

  // ----------------------------------------------------------
  // Pedidos — execução do gozo
  // ----------------------------------------------------------

  async startRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    actorUserId: number;
  }): Promise<LeaveRequestProps> {
    return withTenant(input.companyId, async (transaction) => {
      const request = await this.loadAggregate(input.companyId, input.requestId, transaction);
      request.assertVersion(input.expectedVersion);

      const props = request.start(new Date());
      await this.saveRequest(transaction, props);
      await this.writeOutbox(transaction, input.companyId, request.pullDomainEvents());
      return props;
    });
  }

  async interruptRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    startDate: string;
    endDate: string;
    reason: string;
    actorUserId: number;
  }): Promise<LeaveRequestProps> {
    return withTenant(input.companyId, async (transaction) => {
      const request = await this.loadAggregate(input.companyId, input.requestId, transaction);
      request.assertVersion(input.expectedVersion);

      if (input.startDate < request.startDate || input.endDate > request.endDate) {
        throw new ValidationError('Interruption must fall within the leave period.');
      }

      const interruption = LeaveInterruption.create({
        companyId: input.companyId,
        requestId: request.id,
        startDate: input.startDate,
        endDate: input.endDate,
        reason: input.reason,
        actorUserId: input.actorUserId,
      });
      await LeaveInterruptionModel.create(
        {
          id: interruption.props.id,
          companyId: interruption.props.companyId,
          requestId: interruption.props.requestId,
          startDate: interruption.props.startDate,
          endDate: interruption.props.endDate,
          reason: interruption.props.reason,
          actorUserId: interruption.props.actorUserId,
          createdAt: interruption.props.createdAt,
        },
        { transaction },
      );

      const props = request.interrupt(new Date());
      await this.saveRequest(transaction, props);
      await this.writeOutbox(transaction, input.companyId, request.pullDomainEvents());
      return props;
    });
  }

  async completeRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    usedDays?: number;
    actorUserId: number;
  }): Promise<LeaveRequestProps> {
    return withTenant(input.companyId, async (transaction) => {
      const request = await this.loadAggregate(input.companyId, input.requestId, transaction);
      request.assertVersion(input.expectedVersion);

      const reservedDays = request.requestedDays;
      const usedDays = input.usedDays ?? reservedDays;
      if (!Number.isInteger(usedDays) || usedDays <= 0 || usedDays > reservedDays) {
        throw new ValidationError(
          'Used days must be a positive whole number not exceeding the requested days.',
        );
      }

      // RN-048: impede reconciliações duplicadas do mesmo pedido.
      await this.assertNotReconciled(
        input.companyId,
        request.id,
        ['RELEASE', 'USAGE'],
        transaction,
      );
      await this.lockAccount(input.companyId, request.accountId, transaction);

      const props = request.complete(new Date());

      // §10.2 / CA-012/013: liberta a reserva integral e regista
      // a utilização efectiva — sem dupla contabilização.
      await this.insertMovement(transaction, {
        companyId: input.companyId,
        accountId: request.accountId,
        movementType: 'RELEASE',
        days: reservedDays,
        referenceId: request.id,
        actorUserId: input.actorUserId,
      });
      await this.insertMovement(transaction, {
        companyId: input.companyId,
        accountId: request.accountId,
        movementType: 'USAGE',
        days: -usedDays,
        referenceId: request.id,
        actorUserId: input.actorUserId,
      });

      await this.saveRequest(transaction, props);
      await this.writeOutbox(transaction, input.companyId, request.pullDomainEvents());
      return props;
    });
  }

  // ----------------------------------------------------------
  // Privados
  // ----------------------------------------------------------

  /** Carrega o pedido bloqueado (`FOR UPDATE`) com filhos. */
  private async loadAggregate(
    companyId: number,
    id: string,
    transaction: Transaction,
  ): Promise<LeaveRequest> {
    const row = await LeaveRequestModel.findOne({
      where: { id, companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!row) throw new LeaveNotFoundError('Leave request');

    const periodRows = await LeaveRequestPeriodModel.findAll({
      where: { companyId, requestId: id },
      order: [['startDate', 'ASC']],
      transaction,
    });
    const approvalRows = await LeaveApprovalModel.findAll({
      where: { companyId, requestId: id },
      order: [['decidedAt', 'ASC']],
      transaction,
    });

    return LeaveRequest.restore({
      ...mapRequestRow(row),
      periods: periodRows.map((period) => ({
        id: period.id,
        companyId: period.companyId,
        requestId: period.requestId,
        startDate: dateOnly(period.startDate),
        endDate: dateOnly(period.endDate),
        calculatedDays: period.calculatedDays,
      })),
      approvals: approvalRows.map((approval) => ({
        id: approval.id,
        companyId: approval.companyId,
        requestId: approval.requestId,
        approverUserId: approval.approverUserId,
        decision: approval.decision,
        comments: approval.comments,
        decidedAt: approval.decidedAt,
      })),
    });
  }

  private async saveRequest(transaction: Transaction, props: LeaveRequestProps): Promise<void> {
    await LeaveRequestModel.update(
      {
        leaveType: props.leaveType,
        status: props.status,
        reason: props.reason,
        requestedDays: props.requestedDays,
        startDate: props.startDate,
        endDate: props.endDate,
        submittedAt: props.submittedAt,
        decidedAt: props.decidedAt,
        version: props.version,
        updatedAt: props.updatedAt,
      },
      { where: { id: props.id, companyId: props.companyId }, transaction },
    );
  }

  /** Substituição total dos segmentos (histórico vive nas decisões). */
  private async syncPeriods(
    transaction: Transaction,
    companyId: number,
    requestId: string,
    periods: LeaveRequestProps['periods'],
  ): Promise<void> {
    await LeaveRequestPeriodModel.destroy({
      where: { companyId, requestId },
      transaction,
    });
    for (const period of periods) {
      await LeaveRequestPeriodModel.create(
        {
          id: period.id,
          companyId: period.companyId,
          requestId: period.requestId,
          startDate: period.startDate,
          endDate: period.endDate,
          calculatedDays: period.calculatedDays,
          createdAt: new Date(),
        },
        { transaction },
      );
    }
  }

  /** Persiste as decisões novas (ainda sem id) do agregado. */
  private async insertNewApprovals(
    transaction: Transaction,
    props: LeaveRequestProps,
  ): Promise<void> {
    for (const approval of props.approvals) {
      if (approval.id !== null) continue;
      await LeaveApprovalModel.create(
        {
          companyId: approval.companyId,
          requestId: approval.requestId,
          approverUserId: approval.approverUserId,
          decision: approval.decision,
          comments: approval.comments,
          decidedAt: approval.decidedAt,
          createdAt: approval.decidedAt,
        },
        { transaction },
      );
    }
  }

  private async lockAccount(
    companyId: number,
    accountId: string,
    transaction: Transaction,
  ): Promise<LeaveAccountModel> {
    const row = await LeaveAccountModel.findOne({
      where: { id: accountId, companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!row) throw new LeaveNotFoundError('Leave account');
    return row;
  }

  private async balanceOf(
    companyId: number,
    accountId: string,
    transaction: Transaction,
  ): Promise<LeaveBalance> {
    const rows = await LeaveBalanceMovementModel.findAll({
      where: { companyId, accountId },
      transaction,
    });
    return LeaveBalance.fromMovements(
      rows.map((row) => ({
        movementType: row.movementType as LeaveMovementType,
        days: row.days,
      })),
    );
  }

  /**
   * RN-017: primeiro pedido COMPROMETIDO do trabalhador cujos
   * períodos reais se sobrepõem ao intervalo candidato.
   */
  private async findBlockingConflict(
    companyId: number,
    employeeId: string,
    startDate: string,
    endDate: string,
    excludeRequestId: string | undefined,
    transaction: Transaction,
  ): Promise<string | null> {
    const candidates = await LeaveRequestModel.findAll({
      where: {
        companyId,
        employeeId,
        status: { [Op.in]: [...BLOCKING_LEAVE_STATUSES] },
        startDate: { [Op.lte]: endDate },
        endDate: { [Op.gte]: startDate },
        ...(excludeRequestId ? { id: { [Op.ne]: excludeRequestId } } : {}),
      },
      attributes: ['id'],
      transaction,
    });

    for (const candidate of candidates) {
      const period = await LeaveRequestPeriodModel.findOne({
        where: {
          companyId,
          requestId: candidate.id,
          startDate: { [Op.lte]: endDate },
          endDate: { [Op.gte]: startDate },
        },
        transaction,
      });
      if (period) return candidate.id;
    }
    return null;
  }

  /** RN-048: o pedido ainda não tem movimentos de `types`. */
  private async assertNotReconciled(
    companyId: number,
    requestId: string,
    types: LeaveMovementType[],
    transaction: Transaction,
  ): Promise<void> {
    const existing = await LeaveBalanceMovementModel.findOne({
      where: {
        companyId,
        referenceId: requestId,
        movementType: { [Op.in]: types },
      },
      transaction,
    });
    if (existing) throw new LeaveAlreadyReconciledError();
  }

  /** Escreve um movimento validado no ledger imutável. */
  private async insertMovement(
    transaction: Transaction,
    input: {
      companyId: number;
      accountId: string;
      entitlementId?: string | null;
      movementType: LeaveMovementType;
      days: number;
      referenceId?: string | null;
      reason?: string | null;
      actorUserId?: number | null;
    },
  ): Promise<number> {
    const movement = LeaveBalanceMovement.create(input);
    const row = await LeaveBalanceMovementModel.create(
      {
        companyId: input.companyId,
        accountId: input.accountId,
        entitlementId: input.entitlementId ?? null,
        movementType: input.movementType,
        days: movement.props.days,
        referenceId: input.referenceId ?? null,
        reason: input.reason ?? null,
        actorUserId: input.actorUserId ?? null,
        createdAt: movement.props.createdAt,
      },
      { transaction },
    );
    return row.id;
  }

  /** Outbox transaccional: eventos persistem com a operação. */
  private async writeOutbox(
    transaction: Transaction,
    companyId: number,
    events: DomainEvent[],
  ): Promise<void> {
    for (const event of events) {
      const payload = (event as LeaveEvent).payload ?? {};
      await LeaveOutboxModel.create(
        {
          companyId,
          aggregateId: String(event.aggregateId),
          eventType: event.eventName,
          payload: { eventId: event.eventId, ...payload },
          occurredAt: event.occurredAt,
          publishedAt: null,
        },
        { transaction },
      );
    }
  }
}
