import {
  RecordStorePort,
  RecordStoreContext,
} from '../../../../shared/application/ports/record-store.port';
export interface PayslipRecord {
  id: string;
  companyId: number;
  status: string;
  runId: string | null;
  employeeId: string | null;
  key: string;
  data: Record<string, any>;
}
export type PayslipCollection =
  | 'employeeUserLink'
  | 'payslipAccessLog'
  | 'payslipBatchItem'
  | 'payslipBatch'
  | 'payslipCorrection'
  | 'payslipDelivery'
  | 'payslipDocument'
  | 'payslip'
  | 'payslipOutbox'
  | 'payslipPolicy'
  | 'payslipPublication'
  | 'payslipTemplate'
  | 'payslipTemplateVersion';
export interface PayslipPersistencePort {
  collections: Record<PayslipCollection, RecordStorePort<PayslipRecord>>;
  update(
    record: PayslipRecord,
    changes: Partial<PayslipRecord>,
    options?: { transaction?: RecordStoreContext },
  ): Promise<PayslipRecord>;
}
export interface PayslipPayrollResult {
  id: string;
  companyId: number;
  runId: string;
  employeeId: string;
  calculationSnapshot: unknown;
  grossAmount: string;
  deductionsAmount: string;
  netAmount: string;
  employerCostsAmount: string;
  currency: string;
}
export interface PayslipPayrollRun {
  id: string;
  companyId: number;
  periodId: string;
  status: string;
  runType: string;
  originalRunId: string | null;
}
export type PayslipReader<T> = {
  findOne(
    query: import('../../../../shared/application/ports/record-store.port').RecordQuery,
  ): Promise<T | null>;
  findAll(
    query: import('../../../../shared/application/ports/record-store.port').RecordQuery,
  ): Promise<T[]>;
};
export interface PayslipSourcesPort {
  results: PayslipReader<PayslipPayrollResult>;
  runs: PayslipReader<PayslipPayrollRun>;
  periods: PayslipReader<{ id: string; companyId: number; startDate: string; endDate: string }>;
  employees: PayslipReader<{
    id: string;
    companyId: number;
    firstName: string;
    lastName: string;
    employeeNumber: string;
    departmentId: number | null;
    jobTitle: string | null;
  }>;
  company(
    companyId: number,
    context: RecordStoreContext,
  ): Promise<{ id: number; name: string; nif: string | null } | null>;
  hasActiveMembership(
    companyId: number,
    userId: number,
    context: RecordStoreContext,
  ): Promise<boolean>;
}
