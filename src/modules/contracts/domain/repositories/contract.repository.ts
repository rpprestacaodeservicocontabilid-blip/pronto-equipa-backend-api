import { EmploymentContractProps } from '../aggregates/employment-contract.aggregate';

export interface ContractListQuery {
  page: number;
  limit: number;
  employeeId?: string;
  status?: string;
  typeCode?: string;
  expiringWithinDays?: number;
}

export interface ContractRecord {
  id: number;
  type: string;
  actorUserId: number | null;
  createdAt: Date;
  payload: Record<string, unknown>;
}

export interface ContractType {
  id: number;
  companyId: number | null;
  code: string;
  name: string;
  legalRuleVersionId: string | null;
  requiresEndDate: boolean;
  maxRenewals: number | null;
  active: boolean;
}

export interface ContractRepository {
  create(contract: EmploymentContractProps, actorUserId: number): Promise<EmploymentContractProps>;
  find(companyId: number, id: string): Promise<EmploymentContractProps | null>;
  list(
    companyId: number,
    query: ContractListQuery,
  ): Promise<{
    data: EmploymentContractProps[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>;
  updateDraft(
    companyId: number,
    id: string,
    expectedVersion: number,
    changes: Partial<
      Pick<
        EmploymentContractProps,
        | 'typeCode'
        | 'legalRuleVersionId'
        | 'startDate'
        | 'endDate'
        | 'currency'
        | 'salaryAmount'
        | 'terms'
      >
    >,
    actorUserId: number,
  ): Promise<EmploymentContractProps>;
  transition(
    companyId: number,
    id: string,
    expectedVersion: number,
    status: EmploymentContractProps['status'],
    recordType: string,
    actorUserId: number,
    payload?: Record<string, unknown>,
  ): Promise<EmploymentContractProps>;
  addRecord(
    companyId: number,
    id: string,
    expectedVersion: number,
    recordType: string,
    actorUserId: number,
    payload: Record<string, unknown>,
  ): Promise<EmploymentContractProps>;
  records(companyId: number, id: string, type?: string): Promise<ContractRecord[]>;
  listTypes(companyId: number): Promise<ContractType[]>;
  createType(
    companyId: number,
    input: Omit<ContractType, 'id' | 'companyId'>,
  ): Promise<ContractType>;
  verifyEmployee(companyId: number, employeeId: string): Promise<boolean>;
  generateExpirationAlerts(companyId: number, asOfDate: string): Promise<number>;
  expireEndedContracts(companyId: number, asOfDate: string): Promise<number>;
}
