import { randomUUID } from 'crypto';
import { ConflictError, ValidationError } from '../../../../shared/errors/app.error';
import { ContractNumber } from '../value-objects/contract-number.vo';
import { ContractPeriod } from '../value-objects/contract-period.vo';

export const CONTRACT_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'TERMINATED',
  'REJECTED',
  'CANCELLED',
] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export interface EmploymentContractProps {
  id: string;
  companyId: number;
  employeeId: string;
  contractNumber: string;
  typeCode: string;
  legalRuleVersionId: string | null;
  status: ContractStatus;
  startDate: string;
  endDate: string | null;
  currency: string;
  salaryAmount: string | null;
  terms: Record<string, unknown>;
  version: number;
}

export class EmploymentContract {
  private constructor(readonly props: EmploymentContractProps) {}

  static create(
    input: Omit<EmploymentContractProps, 'id' | 'status' | 'version' | 'legalRuleVersionId'> & {
      legalRuleVersionId?: string | null;
    },
  ): EmploymentContract {
    if (!Number.isSafeInteger(input.companyId) || input.companyId <= 0) {
      throw new ValidationError('A valid company context is required.');
    }
    ContractNumber.create(input.contractNumber);
    ContractPeriod.create(input.startDate, input.endDate);
    if (!/^[A-Z]{3}$/.test(input.currency)) {
      throw new ValidationError('Currency must be a three-letter ISO code.');
    }
    if (
      input.salaryAmount !== null &&
      (!/^\d+(\.\d{1,2})?$/.test(input.salaryAmount) || Number(input.salaryAmount) < 0)
    ) {
      throw new ValidationError('Contract salary must be a non-negative amount.');
    }
    return new EmploymentContract({
      ...input,
      legalRuleVersionId: input.legalRuleVersionId ?? null,
      id: randomUUID(),
      contractNumber: ContractNumber.create(input.contractNumber).value,
      status: 'DRAFT',
      version: 1,
    });
  }

  static restore(props: EmploymentContractProps): EmploymentContract {
    ContractPeriod.create(props.startDate, props.endDate);
    if (!(CONTRACT_STATUSES as readonly string[]).includes(props.status)) {
      throw new ValidationError('Invalid contract status.');
    }
    return new EmploymentContract(props);
  }

  transition(next: ContractStatus): EmploymentContractProps {
    const allowed: Record<ContractStatus, ContractStatus[]> = {
      DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
      PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'],
      APPROVED: ['ACTIVE', 'CANCELLED'],
      ACTIVE: ['SUSPENDED', 'TERMINATED', 'EXPIRED'],
      SUSPENDED: ['ACTIVE', 'TERMINATED', 'EXPIRED'],
      EXPIRED: [],
      TERMINATED: [],
      REJECTED: [],
      CANCELLED: [],
    };
    if (!allowed[this.props.status].includes(next)) {
      throw new ConflictError(`Contract cannot transition from ${this.props.status} to ${next}.`);
    }
    return { ...this.props, status: next, version: this.props.version + 1 };
  }

  assertRenewable(newEndDate: string): void {
    if (!['ACTIVE', 'EXPIRED'].includes(this.props.status) || !this.props.endDate) {
      throw new ConflictError('Only a fixed-term contract with an end date can be renewed.');
    }
    ContractPeriod.create(this.props.startDate, newEndDate);
    if (newEndDate <= this.props.endDate) {
      throw new ValidationError('Renewal end date must extend the current contract term.');
    }
  }
}
