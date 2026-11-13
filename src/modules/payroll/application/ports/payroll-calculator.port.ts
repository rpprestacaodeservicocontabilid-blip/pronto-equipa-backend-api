export interface PayrollInputSnapshot {
  companyId: number;
  payrollRunId: string;
  employeeId: string;
  inputSnapshotId: string;
  inputHash: string;
  period: { startDate: string; endDate: string };
  salarySnapshotId: string;
  contractSnapshotId: string;
  legalRuleSetVersion: string;
  data: Record<string, unknown>;
}

export interface PayrollCalculationResult {
  employeeId: string;
  grossAmount: string;
  deductionsAmount: string;
  netAmount: string;
  employerCostsAmount: string;
  currency: string;
  engineVersion: string;
  legalRuleSetVersion: string;
  calculationTraceId: string;
  issues?: Array<{ severity: 'WARNING' | 'BLOCKING'; code: string; message: string; sourceReference?: string }>;
  calculationTrace?: Record<string, unknown>;
  lines: Array<{
    code: string;
    type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_COST';
    amount: string;
    sourceReference: string;
  }>;
}

export interface PayrollCalculatorPort {
  calculate(input: PayrollInputSnapshot): Promise<PayrollCalculationResult>;
}
