import {
  RecordStorePort,
  RecordStoreContext,
  RecordQuery,
} from '../../../../shared/application/ports/record-store.port';
import { RunStatus, RunType } from '../../domain/payroll';
import { PayrollInputSnapshot, PayrollCalculationResult } from './payroll-calculator.port';
export interface PayrollWorkflowRecord {
  id: string;
  companyId: number;
  runId: string | null;
  employeeId: string | null;
  status: string;
  version: number;
  key: string;
  data: Record<string, unknown>;
}
export interface PayrollRunRecord {
  id: string;
  companyId: number;
  periodId: string;
  runType: RunType;
  executionScope: 'INDIVIDUAL' | 'COLLECTIVE';
  employeeIds: string[];
  status: RunStatus;
  version: number;
  requestHash: string;
  originalRunId: string | null;
  reason: string | null;
  idempotencyKey: string;
  createdBy: number;
}
export interface PayrollPeriodRecord {
  id: string;
  companyId: number;
  startDate: string;
  endDate: string;
  paymentDate: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  version: number;
  createdBy: number;
}
export interface PayrollResultRecord {
  id: string;
  companyId: number;
  runId: string;
  employeeId: string;
  grossAmount: string;
  deductionsAmount: string;
  netAmount: string;
  employerCostsAmount: string;
  currency: string;
  calculationSnapshot: unknown;
  [field: string]: unknown;
}
export interface PayrollInputRecord {
  id: string;
  companyId: number;
  runId: string;
  employeeId: string;
  inputHash: string;
  snapshotData: unknown;
}
export interface PayrollOutboxRecord {
  id: string;
  companyId: number;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  publishedAt: Date | null;
}
export type PayrollWorkflowCollection =
  | 'payrollAdjustment'
  | 'payrollApproval'
  | 'payrollBatch'
  | 'payrollCalculation'
  | 'payrollClosing'
  | 'payrollInstruction'
  | 'payrollIssue'
  | 'payrollItem'
  | 'payrollLine'
  | 'payrollPolicy'
  | 'payrollExport';
export interface PayrollPersistencePort {
  collections: Record<PayrollWorkflowCollection, RecordStorePort<PayrollWorkflowRecord>>;
  runs: RecordStorePort<PayrollRunRecord>;
  periods: RecordStorePort<PayrollPeriodRecord>;
  results: RecordStorePort<PayrollResultRecord>;
  inputs: RecordStorePort<PayrollInputRecord>;
  outbox: RecordStorePort<PayrollOutboxRecord>;
  update(
    record: PayrollWorkflowRecord,
    changes: Partial<PayrollWorkflowRecord>,
    options?: { transaction?: RecordStoreContext },
  ): Promise<PayrollWorkflowRecord>;
  employeeCount(query: RecordQuery): Promise<number>;
  releaseLoans(changes: { payrollRunId: null }, query: RecordQuery): Promise<number>;
}
export interface PayrollLoanReservationPort {
  reserve(
    companyId: number,
    runId: string,
    snapshot: PayrollInputSnapshot,
    result: PayrollCalculationResult,
    context: RecordStoreContext,
    simulation: boolean,
  ): Promise<void>;
}
export interface PayrollExportRendererPort {
  pdf(rows: string[][]): Buffer;
  xlsx(rows: string[][]): Buffer;
}
