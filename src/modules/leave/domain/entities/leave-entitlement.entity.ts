import { randomUUID } from 'crypto';
import { ValidationError } from '../../../../shared/errors/app.error';
import { LeaveDays } from '../value-objects/leave-days.vo';
import { isDateOnly } from '../value-objects/leave-period.vo';

export interface LeaveEntitlementProps {
  id: string;
  companyId: number;
  accountId: string;
  /** Início do período de aquisição (YYYY-MM-DD). */
  accrualPeriodStart: string;
  /** Fim do período de aquisição (YYYY-MM-DD). */
  accrualPeriodEnd: string;
  days: number;
  legalRuleVersionId: string | null;
  createdAt: Date;
}

/**
 * Direito adquirido a férias num período de aquisição (RN-005..009).
 *
 * Uma vez consolidado, NUNCA é alterado directamente: qualquer
 * correcção passa por um movimento ADJUSTMENT auditável (RN-008).
 */
export class LeaveEntitlement {
  private constructor(readonly props: LeaveEntitlementProps) {}

  static create(input: {
    companyId: number;
    accountId: string;
    accrualPeriodStart: string;
    accrualPeriodEnd: string;
    days: number;
    legalRuleVersionId?: string | null;
    now?: Date;
  }): LeaveEntitlement {
    if (!isDateOnly(input.accrualPeriodStart) || !isDateOnly(input.accrualPeriodEnd)) {
      throw new ValidationError('Accrual period must use valid calendar dates.');
    }
    if (input.accrualPeriodEnd < input.accrualPeriodStart) {
      throw new ValidationError('Accrual period end cannot precede its start.');
    }
    if (!Number.isSafeInteger(input.companyId) || input.companyId <= 0) {
      throw new ValidationError('A valid company context is required.');
    }
    LeaveDays.create(input.days);

    return new LeaveEntitlement({
      id: randomUUID(),
      companyId: input.companyId,
      accountId: input.accountId,
      accrualPeriodStart: input.accrualPeriodStart,
      accrualPeriodEnd: input.accrualPeriodEnd,
      days: input.days,
      legalRuleVersionId: input.legalRuleVersionId ?? null,
      createdAt: input.now ?? new Date(),
    });
  }

  static restore(props: LeaveEntitlementProps): LeaveEntitlement {
    return new LeaveEntitlement(props);
  }
}
