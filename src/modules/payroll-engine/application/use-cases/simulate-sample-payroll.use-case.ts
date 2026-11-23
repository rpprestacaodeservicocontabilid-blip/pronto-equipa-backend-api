import { PayrollCalculatorPort, PayrollEngineInput, PayrollLegalRuleSet, PAYROLL_ENGINE_VERSION, RoundingMode } from '../../domain/contracts/payroll-engine.contract';
import { sha256 } from '../../domain/services/hash.service';
import { CalculatePayrollUseCase } from './calculate-payroll.use-case';

export interface SamplePayrollInput {
  month: string;
  baseSalary: string;
  allowance: string;
  annualAllowance: string;
  deduction: string;
  deductionAuthorized: boolean;
  rounding: RoundingMode;
}

/** A reproducible test fixture, available only through the simulation operation. */
export class SimulateSamplePayrollUseCase {
  constructor(private readonly calculator: PayrollCalculatorPort = new CalculatePayrollUseCase()) {}

  execute(tenantId: number, scenario: SamplePayrollInput) {
    const [year, month] = scenario.month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const period = { startDate: scenario.month + '-01', endDate: scenario.month + '-' + lastDay };
    const rules: PayrollLegalRuleSet = {
      ruleSetId: 'SYNTHETIC_PAYROLL_SAMPLE',
      version: 'synthetic-1',
      status: 'PUBLISHED',
      jurisdiction: 'AO',
      effectiveFrom: '2000-01-01',
      sourceReference: 'fixture:payroll-engine:synthetic-1',
      roundingPolicy: { mode: scenario.rounding, scale: 2 },
      laborRules: { prorationBasis: 'CALENDAR_DAYS' },
      socialSecurityRules: { employeeRate: '0.01', employerRate: '0.02' },
      incomeTaxRules: { calculation: 'PROGRESSIVE', brackets: [{ from: '0', rate: '0.04' }] },
      deductionRules: { maxPercentageOfGross: '0.20', allowedCategories: ['SAMPLE'], allowPartial: true },
    };
    const snapshot: Omit<PayrollEngineInput, 'inputHash'> = {
      tenantId,
      employeeId: 'synthetic-employee',
      payrollRunId: 'synthetic-run',
      period,
      currency: 'AOA',
      engineVersion: PAYROLL_ENGINE_VERSION,
      legalRules: { ...rules, integrityHash: sha256(rules) },
      segments: [{
        ...period,
        baseSalary: scenario.baseSalary,
        components: [
          {
            code: 'SAMPLE_MONTHLY_ALLOWANCE', kind: 'EARNING', frequency: 'MONTHLY',
            amount: scenario.allowance, sourceReference: 'fixture:monthly-allowance',
          },
          {
            code: 'SAMPLE_ANNUAL_ALLOWANCE', kind: 'EARNING', frequency: 'ANNUAL',
            amount: scenario.annualAllowance, sourceReference: 'fixture:annual-allowance',
          },
        ],
      }],
      deductions: [{
        code: 'SAMPLE_DEDUCTION',
        requestedAmount: scenario.deduction,
        authorized: scenario.deductionAuthorized,
        priority: 1,
        category: 'SAMPLE',
        sourceReference: 'fixture:deduction',
      }],
    };
    const inputHash = sha256(snapshot);
    return this.calculator.simulate({ ...snapshot, inputHash, calculationInputHash: inputHash });
  }
}
