export const SIMULATION_TYPES = [
  'INDIVIDUAL_PAYROLL',
  'BULK_PAYROLL',
  'SALARY_INCREASE',
  'CONTRACT_CHANGE',
  'NEW_HIRE',
  'PROMOTION',
  'ALLOWANCES',
  'OVERTIME',
  'ABSENCE',
  'LOAN_DEDUCTIONS',
  'EMPLOYER_COST',
  'BUDGET_FORECAST',
  'LEGAL_RULE_CHANGE',
  'RETROACTIVE_IMPACT',
  'CUSTOM',
] as const;
export type SimulationType = (typeof SIMULATION_TYPES)[number];
export const SCENARIO_STATES = [
  'DRAFT',
  'READY',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'ARCHIVED',
] as const;
export const RUN_STATES = [
  'PENDING',
  'VALIDATING',
  'PROCESSING',
  'COMPLETED',
  'PARTIALLY_COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type AdjustmentOperation =
  | 'SET'
  | 'ADD'
  | 'SUBTRACT'
  | 'PERCENT_INCREASE'
  | 'PERCENT_DECREASE';
export interface SimulationAdjustment {
  employeeId?: string;
  componentCode: string;
  operation: AdjustmentOperation;
  value: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}
export interface SimulationPeriod {
  startDate: string;
  endDate: string;
}
export interface ScenarioConfiguration {
  period: SimulationPeriod;
  employeeIds?: string[];
  departmentId?: number;
  jobCategory?: string;
  excludeEmployeeIds?: string[];
  adjustments: SimulationAdjustment[];
  baselinePayrollRunId?: string | null;
  assumptions?: Record<string, unknown>;
}
export const SIMULATION_PERMISSIONS = {
  read: 'simulations:read',
  create: 'simulations:scenarios:create',
  update: 'simulations:scenarios:update',
  duplicate: 'simulations:scenarios:duplicate',
  archive: 'simulations:scenarios:archive',
  execute: 'simulations:runs:execute',
  runRead: 'simulations:runs:read',
  retry: 'simulations:runs:retry',
  cancel: 'simulations:runs:cancel',
  individual: 'simulations:individual:execute',
  bulk: 'simulations:bulk:execute',
  sensitive: 'simulations:salary:read-sensitive',
  legal: 'simulations:legal-rules:compare',
  projections: 'simulations:projections:read',
  comparison: 'simulations:comparisons:create',
  proposalCreate: 'simulations:proposals:create',
  proposalRead: 'simulations:proposals:read',
  approve: 'simulations:proposals:approve',
  reject: 'simulations:proposals:reject',
  exportsCreate: 'simulations:exports:create',
  exportsDownload: 'simulations:exports:download',
  history: 'simulations:history:read',
  policy: 'simulations:policies:manage',
} as const;
