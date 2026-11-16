export type PayslipStatus =
  | 'PENDING'
  | 'GENERATING'
  | 'GENERATED'
  | 'VALIDATED'
  | 'PUBLISHED'
  | 'SUPERSEDED'
  | 'GENERATION_FAILED'
  | 'PUBLICATION_FAILED'
  | 'ARCHIVED';

export type PayslipType =
  | 'REGULAR'
  | 'OFF_CYCLE'
  | 'SUPPLEMENTARY'
  | 'RETROACTIVE'
  | 'CORRECTION'
  | 'TERMINATION'
  | 'DUPLICATE_COPY';

export interface PayslipLine {
  code: string;
  description: string;
  type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_COST';
  amount: string;
  displayOrder: number;
  sourceReference: string;
}

export interface PayslipSnapshot {
  tenantId: string;
  employeeId: string;
  payrollRunId: string;
  payrollResultId: string;
  employer: { name: string; taxId: string; address?: string | null };
  employee: {
    fullName: string;
    employeeCode: string;
    taxId?: string | null;
    department?: string | null;
    jobTitle?: string | null;
  };
  period: { startDate: string; endDate: string };
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  employerCosts: PayslipLine[];
  grossAmount: string;
  totalDeductions: string;
  netAmount: string;
  employerCostsAmount: string;
  currency: string;
  payrollSnapshotHash: string;
  engineVersion: string;
  legalRuleSetVersion: string;
}
