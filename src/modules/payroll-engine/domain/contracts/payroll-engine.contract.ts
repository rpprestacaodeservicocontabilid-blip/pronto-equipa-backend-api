export const PAYROLL_ENGINE_VERSION = '1.0.1';

export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'DOWN' | 'UP';
export type PayrollLineKind = 'EARNING' | 'DEDUCTION' | 'EMPLOYER_COST';

export interface PayrollEngineInput {
  tenantId: number;
  employeeId: string;
  payrollRunId: string;
  period: { startDate: string; endDate: string };
  currency: 'AOA';
  engineVersion: string;
  inputHash: string;
  calculationInputHash?: string;
  legalRules: PayrollLegalRuleSet;
  segments: Array<{
    startDate: string;
    endDate: string;
    baseSalary: string;
    components: Array<{
      code: string;
      amount: string;
      kind: 'EARNING' | 'DEDUCTION';
      sourceReference: string;
      frequency?: 'MONTHLY' | 'WEEKLY' | 'BIWEEKLY' | 'ANNUAL' | 'ONE_TIME';
      taxable?: boolean;
      contributory?: boolean;
    }>;
  }>;
  attendance?: {
    absences?: Array<{
      code: string;
      amount: string;
      sourceReference: string;
      authorized?: boolean;
    }>;
    overtime?: Array<{
      code: string;
      hours: string;
      hourlyRate: string;
      sourceReference: string;
      authorized: boolean;
      category: string;
      workDate?: string;
    }>;
    nightWork?: Array<{
      code: string;
      hours: string;
      hourlyRate: string;
      sourceReference: string;
      workDate?: string;
    }>;
  };
  deductions?: Array<{
    code: string;
    requestedAmount: string;
    priority: number;
    sourceReference: string;
    authorized: boolean;
    category: string;
  }>;
  leave?: Array<{
    code: string;
    startDate: string;
    endDate: string;
    paid: boolean;
    sourceReference: string;
  }>;
  originalResult?: PayrollEngineResult;
  expectedLegalRuleSetVersion?: string;
}

export interface PayrollLegalRuleSet {
  ruleSetId: string;
  version: string;
  status: 'PUBLISHED';
  jurisdiction: 'AO';
  effectiveFrom: string;
  effectiveTo?: string | null;
  sourceReference: string;
  integrityHash?: string;
  roundingPolicy: { mode: RoundingMode; scale: 2 };
  laborRules: {
    prorationBasis: 'CALENDAR_DAYS' | 'FIXED_PERIOD_DAYS';
    fixedPeriodDays?: number;
    overtimeMultipliers?: Record<string, string>;
    nightWorkMultipliers?: Record<string, string>;
    maximumDailyOvertimeHours?: string;
  };
  socialSecurityRules: {
    employeeRate: string;
    employerRate: string;
    includedComponentCodes?: string[];
    excludedComponentCodes?: string[];
    minimumBase?: string;
    maximumBase?: string;
  };
  incomeTaxRules: {
    includedComponentCodes?: string[];
    excludedComponentCodes?: string[];
    exemptionAmount?: string;
    brackets: Array<{ from: string; to?: string | null; rate: string; deduction?: string }>;
    calculation: 'PROGRESSIVE' | 'MARGINAL';
    socialSecurityDeductible?: boolean;
  };
  deductionRules: {
    maxPercentageOfGross?: string;
    protectedNetAmount?: string;
    allowPartial?: boolean;
    allowedCategories?: string[];
  };
  compatibility?: { engineVersions?: string[] };
}

export interface PayrollCalculationLine {
  code: string;
  type: PayrollLineKind;
  amount: string;
  sourceReference: string;
  requestedAmount?: string;
  remainingAmount?: string;
  formula?: string;
}

export interface CalculationIssue {
  severity: 'WARNING' | 'BLOCKING';
  code: string;
  message: string;
  sourceReference?: string;
}

export interface PayrollEngineResult {
  tenantId: number;
  employeeId: string;
  payrollRunId: string;
  grossAmount: string;
  taxableAmount: string;
  contributionBase: string;
  employeeSocialSecurity: string;
  employerSocialSecurity: string;
  incomeTax: string;
  otherDeductions: string;
  totalDeductions: string;
  netAmount: string;
  employerCostsAmount: string;
  totalEmployerCost: string;
  currency: 'AOA';
  lines: PayrollCalculationLine[];
  issues: CalculationIssue[];
  trace: {
    calculationTraceId: string;
    inputHash: string;
    resultHash: string;
    hashVersion?: 2;
    calculationInputHash?: string;
    roundingPolicy?: PayrollLegalRuleSet['roundingPolicy'];
    engineVersion: string;
    legalRuleSetId: string;
    legalRuleSetVersion: string;
    legalSourceReference: string;
    steps: Array<{ code: string; description: string; amount?: string; formula?: string }>;
  };
}

export interface PayrollCalculatorPort {
  calculate(input: PayrollEngineInput): PayrollEngineResult;
  simulate(input: PayrollEngineInput): PayrollEngineResult;
  calculateDifference(input: PayrollEngineInput): PayrollEngineResult;
  explain(result: PayrollEngineResult): PayrollEngineResult['trace'];
}
