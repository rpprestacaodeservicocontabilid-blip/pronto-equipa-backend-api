import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { ValidationError } from '../../../../shared/errors/app.error';
import { LeaveEvent } from '../events/leave.event';
import { LeaveBalance } from '../value-objects/leave-balance.vo';

export const LEAVE_ACCOUNT_STATUSES = ['ACTIVE', 'CLOSED'] as const;
export type LeaveAccountStatus = (typeof LEAVE_ACCOUNT_STATUSES)[number];

export interface LeaveAccountProps {
  id: string;
  companyId: number;
  employeeId: string;
  status: LeaveAccountStatus;
  version: number;
}

/**
 * Conta de férias de um trabalhador — raiz de agregado dos
 * direitos, saldos e movimentos (RN-001).
 *
 * Uma conta existe por (empresa, trabalhador): a duplicidade é
 * recusada pela unique constraint e pelo domínio (CA-002).
 */
export class LeaveAccount extends AggregateRoot<LeaveAccountProps> {
  private constructor(props: LeaveAccountProps) {
    super(props);
  }

  static create(input: { companyId: number; employeeId: string }): LeaveAccount {
    if (!Number.isSafeInteger(input.companyId) || input.companyId <= 0) {
      throw new ValidationError('A valid company context is required.');
    }
    if (!input.employeeId) {
      throw new ValidationError('A leave account requires an employee.');
    }
    const account = new LeaveAccount({
      id: randomUUID(),
      companyId: input.companyId,
      employeeId: input.employeeId,
      status: 'ACTIVE',
      version: 1,
    });
    account.record(
      new LeaveEvent({
        eventName: 'leave.account.created',
        occurredAt: new Date(),
        aggregateId: account.props.id,
        companyId: account.props.companyId,
        payload: { accountId: account.props.id, employeeId: account.props.employeeId },
      }),
    );
    return account;
  }

  static restore(props: LeaveAccountProps): LeaveAccount {
    if (!(LEAVE_ACCOUNT_STATUSES as readonly string[]).includes(props.status)) {
      throw new ValidationError('Invalid leave account status.');
    }
    return new LeaveAccount(props);
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

  get status(): LeaveAccountStatus {
    return this.props.status;
  }

  get version(): number {
    return this.props.version;
  }

  get propsSnapshot(): LeaveAccountProps {
    return { ...this.props };
  }

  close(): LeaveAccountProps {
    if (this.props.status === 'CLOSED') {
      throw new ValidationError('Leave account is already closed.');
    }
    return { ...this.props, status: 'CLOSED', version: this.props.version + 1 };
  }

  /** Garante que a conta pode consumir saldo (RN-012). */
  assertActive(): void {
    if (this.props.status !== 'ACTIVE') {
      throw new ValidationError('Leave account is not active.');
    }
  }

  /** Métricas derivadas do ledger para a composição do saldo. */
  static balanceFrom(movements: Parameters<typeof LeaveBalance.fromMovements>[0]): LeaveBalance {
    return LeaveBalance.fromMovements(movements);
  }
}
