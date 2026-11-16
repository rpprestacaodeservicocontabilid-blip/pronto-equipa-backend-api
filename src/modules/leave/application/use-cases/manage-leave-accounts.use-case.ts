import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { NotFoundError, ValidationError } from '../../../../shared/errors/app.error';
import { LeaveAccountProps } from '../../domain/aggregates/leave-account.aggregate';
import { LeaveAccountExistsError, LeaveNotFoundError } from '../../domain/errors/leave.error';
import { LeaveAccountListQuery, LeaveRepository } from '../../domain/repositories/leave.repository';
import { LeaveWorkUnit } from '../../domain/repositories/leave-work-unit';
import { EmployeeReader } from '../ports/employee-reader.port';

type ActorInput = { companyId: number; actorUserId: number };

/**
 * Caso de uso de CONTAS de férias: criação, direitos adquiridos,
 * ajustes justificados e leitura de saldos/movimentos
 * (RF-001..008 da especificação).
 *
 * A escrita passa sempre pela `LeaveWorkUnit` (transacção + outbox);
 * a auditoria é best-effort e só corre depois da operação confirmada.
 */
export class ManageLeaveAccountsUseCase {
  constructor(
    private readonly repository: LeaveRepository,
    private readonly workUnit: LeaveWorkUnit,
    private readonly employees: EmployeeReader,
    private readonly audit: AuditRecorderPort,
  ) {}

  /** RF-001: cria a conta de férias de um trabalhador (CA-002). */
  async createAccount(input: ActorInput & { employeeId: string }): Promise<LeaveAccountProps> {
    const employee = await this.employees.findActive(input.companyId, input.employeeId);
    if (!employee) throw new NotFoundError('Employee');

    const existing = await this.repository.findAccountByEmployee(input.companyId, input.employeeId);
    if (existing) throw new LeaveAccountExistsError();

    const account = await this.workUnit.createAccount({
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
    return account;
  }

  /** RF-002/005: regista um direito adquirido + movimento ACCRUAL. */
  async accrueEntitlement(
    input: ActorInput & {
      accountId: string;
      accrualPeriodStart: string;
      accrualPeriodEnd: string;
      days: number;
      legalRuleVersionId?: string | null;
    },
  ): Promise<{ entitlementId: string; movementId: number }> {
    await this.requireAccount(input.companyId, input.accountId);

    const result = await this.workUnit.accrueEntitlement({
      companyId: input.companyId,
      accountId: input.accountId,
      accrualPeriodStart: input.accrualPeriodStart,
      accrualPeriodEnd: input.accrualPeriodEnd,
      days: input.days,
      legalRuleVersionId: input.legalRuleVersionId,
      actorUserId: input.actorUserId,
    });

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'leave.entitlement_accrued',
      entityType: 'leave_entitlement',
      entityId: result.entitlementId,
      after: {
        accountId: input.accountId,
        days: input.days,
        accrualPeriodStart: input.accrualPeriodStart,
        accrualPeriodEnd: input.accrualPeriodEnd,
      },
    });
    return result;
  }

  /** RF-008 / RN-013: ajuste do saldo com motivo e responsável. */
  async adjustBalance(
    input: ActorInput & {
      accountId: string;
      days: number;
      reason: string;
      referenceId?: string | null;
    },
  ): Promise<{ movementId: number }> {
    await this.requireAccount(input.companyId, input.accountId);
    if (!input.reason?.trim()) {
      throw new ValidationError('Balance adjustments require a reason.');
    }

    const result = await this.workUnit.adjustBalance({
      companyId: input.companyId,
      accountId: input.accountId,
      days: input.days,
      reason: input.reason,
      referenceId: input.referenceId,
      actorUserId: input.actorUserId,
    });

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'leave.balance_adjusted',
      entityType: 'leave_balance_movement',
      entityId: result.movementId,
      after: { accountId: input.accountId, days: input.days, reason: input.reason },
    });
    return result;
  }

  /**
   * RF-010 / RN-009: recálculo de direitos após alteração
   * contratual — produz um ADJUSTMENT auditável (nunca edita
   * direitos consolidados).
   */
  async recalculateEntitlements(
    input: ActorInput & {
      accountId: string;
      accrualPeriodStart: string;
      accrualPeriodEnd: string;
      days: number;
      legalRuleVersionId?: string | null;
    },
  ): Promise<{ entitlementId: string; adjustmentDays: number }> {
    await this.requireAccount(input.companyId, input.accountId);

    const result = await this.workUnit.recalculateEntitlements({
      companyId: input.companyId,
      accountId: input.accountId,
      accrualPeriodStart: input.accrualPeriodStart,
      accrualPeriodEnd: input.accrualPeriodEnd,
      days: input.days,
      legalRuleVersionId: input.legalRuleVersionId,
      actorUserId: input.actorUserId,
    });

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'leave.entitlement_recalculated',
      entityType: 'leave_entitlement',
      entityId: result.entitlementId,
      after: {
        accountId: input.accountId,
        days: input.days,
        adjustmentDays: result.adjustmentDays,
        accrualPeriodStart: input.accrualPeriodStart,
        accrualPeriodEnd: input.accrualPeriodEnd,
      },
    });
    return result;
  }

  async getAccount(companyId: number, id: string): Promise<LeaveAccountProps> {
    const account = await this.repository.findAccount(companyId, id);
    if (!account) throw new LeaveNotFoundError('Leave account');
    return account;
  }

  listAccounts(companyId: number, query: LeaveAccountListQuery) {
    return this.repository.listAccounts(companyId, query);
  }

  /** Saldo composto do ledger (fonte de verdade — RN-010). */
  async getBalance(companyId: number, accountId: string) {
    await this.requireAccount(companyId, accountId);
    const balance = await this.repository.getBalance(companyId, accountId);
    if (!balance) throw new LeaveNotFoundError('Leave account');
    return balance;
  }

  /** Ledger paginado de movimentos de uma conta. */
  async listMovements(
    companyId: number,
    accountId: string,
    query: {
      page: number;
      limit: number;
      movementType?: 'ACCRUAL' | 'ADJUSTMENT' | 'RESERVATION' | 'RELEASE' | 'USAGE';
    },
  ) {
    await this.requireAccount(companyId, accountId);
    return this.repository.listMovements(companyId, accountId, query);
  }

  /** Direitos adquiridos consolidados (imutáveis — RN-008). */
  async listEntitlements(companyId: number, accountId: string) {
    await this.requireAccount(companyId, accountId);
    return this.repository.listEntitlements(companyId, accountId);
  }

  private async requireAccount(companyId: number, accountId: string): Promise<LeaveAccountProps> {
    const account = await this.repository.findAccount(companyId, accountId);
    if (!account) throw new LeaveNotFoundError('Leave account');
    return account;
  }
}
