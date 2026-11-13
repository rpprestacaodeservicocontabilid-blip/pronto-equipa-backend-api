import { PayrollInputSnapshot } from './payroll-calculator.port';
export interface PayrollSourceReaderPort {
  read(
    companyId: number,
    runId: string,
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<Omit<PayrollInputSnapshot, 'inputSnapshotId' | 'inputHash'>>;
}
export interface PayrollLegalRulesPort {
  resolve(
    companyId: number,
    startDate: string,
    endDate: string,
  ): Promise<{
    version: string;
    ruleSetId?: string;
    status?: 'PUBLISHED';
    effectiveFrom?: string;
    effectiveTo?: string | null;
    sourceReference?: string;
    integrityHash?: string;
    rules: Record<string, unknown>;
  }>;
}
export interface PayrollEventPublisherPort {
  publish(event: {
    id: string;
    companyId: number;
    aggregateId: string;
    type: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}
