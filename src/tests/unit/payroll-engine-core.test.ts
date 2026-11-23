import { SimulateSamplePayrollUseCase } from '../../modules/payroll-engine/application/use-cases/simulate-sample-payroll.use-case';
import { PayrollEngineInput, PayrollLegalRuleSet } from '../../modules/payroll-engine/domain/contracts/payroll-engine.contract';
import { PayrollCalculationService } from '../../modules/payroll-engine/domain/services/payroll-calculation.service';
import { sha256 } from '../../modules/payroll-engine/domain/services/hash.service';
import { Money } from '../../modules/payroll-engine/domain/value-objects/money.vo';
import { DecimalRate, Percentage } from '../../modules/payroll-engine/domain/value-objects/decimal-rate.vo';

const scenario = {
  month: '2026-11',
  baseSalary: '100000.00',
  allowance: '7500.00',
  annualAllowance: '30000.00',
  deduction: '5000.00',
  deductionAuthorized: true,
  rounding: 'HALF_EVEN' as const,
};

describe('Payroll engine core and contracts', () => {
  test('runs a deterministic synthetic scenario and reconciles decimal totals', () => {
    const simulator = new SimulateSamplePayrollUseCase();
    const result = simulator.execute(18, scenario);
    expect(result).toEqual(simulator.execute(18, { ...scenario }));
    expect(result.grossAmount).toBe('110000.00');
    expect(result.totalDeductions).toBe('10500.00');
    expect(result.netAmount).toBe('99500.00');
    expect(result.employerCostsAmount).toBe('2200.00');
    expect(result.lines.find(line => line.code === 'SAMPLE_ANNUAL_ALLOWANCE')?.amount).toBe('2500.00');
    expect(result.trace.calculationInputHash).toBe(result.trace.inputHash);
    expect(result.trace.resultHash).not.toBe(simulator.execute(19, scenario).trace.resultHash);
    expect(simulator.execute(18, { ...scenario, deductionAuthorized: false }).issues)
      .toEqual([expect.objectContaining({ code: 'UNAUTHORIZED_DEDUCTION_IGNORED' })]);
  });

  test('preserves cent precision and applies explicit rounding at ties', () => {
    expect(Money.parse('9007199254740999.98').add(Money.parse('0.01')).toString()).toBe('9007199254740999.99');
    expect(Money.parse('2.345').round('HALF_EVEN').toString()).toBe('2.34');
    expect(Money.parse('-2.345').round('HALF_UP').toString()).toBe('-2.35');
    expect(Money.parse('0.001').round('UP').toString()).toBe('0.01');
    expect(Money.parse('0.009').round('DOWN').toString()).toBe('0.00');
    expect(Money.parse('100').multiplyRate(Percentage.parse('0.05', 'sample rate')).toString()).toBe('5.00');
    expect(Money.parse('100').multiplyRate(DecimalRate.parse('1.25')).toString()).toBe('125.00');
    expect(() => Percentage.parse('1.000001', 'sample rate')).toThrow('Invalid sample rate.');
  });

  test('detects changed inputs and records versions and rounding in the result hash', () => {
    const engine = new PayrollCalculationService();
    const first = new SimulateSamplePayrollUseCase(engine).execute(18, scenario);
    const change = new SimulateSamplePayrollUseCase(engine).execute(18, { ...scenario, rounding: 'HALF_UP' });
    expect(first.netAmount).toEqual(change.netAmount);
    expect(first.trace.resultHash).not.toEqual(change.trace.resultHash);
    const rules: PayrollLegalRuleSet = {
      ruleSetId: 'fixture', version: 'fixture-1', status: 'PUBLISHED', jurisdiction: 'AO',
      sourceReference: 'fixture', effectiveFrom: '2026-01-01',
      roundingPolicy: { mode: 'HALF_EVEN', scale: 2 }, laborRules: { prorationBasis: 'CALENDAR_DAYS' },
      socialSecurityRules: { employeeRate: '0', employerRate: '0', minimumBase: '50000' },
      incomeTaxRules: { calculation: 'PROGRESSIVE', brackets: [{ from: '0', rate: '0' }] },
      deductionRules: { protectedNetAmount: '50000' },
    };
    const period = { startDate: '2026-11-01', endDate: '2026-11-30' };
    const body: Omit<PayrollEngineInput, 'inputHash'> = {
      tenantId: 18, employeeId: 'fixture', payrollRunId: 'fixture', currency: 'AOA', engineVersion: '1.0.0', period,
      segments: [{ ...period, baseSalary: '100000', components: [] }], legalRules: rules,
    };
    const inputHash = sha256(body);
    const input = { ...body, inputHash, calculationInputHash: inputHash };
    expect(engine.calculate(input).netAmount).toBe('100000.00');
    expect(() => engine.calculate({ ...input, segments: [{ ...period, baseSalary: '99999', components: [] }] }))
      .toThrow('Calculation input integrity check failed.');
    const historical = engine.calculate(input);
    const diff = engine.calculateDifference({ ...body, inputHash, originalResult: historical });
    expect(diff.netAmount).toBe('0.00');
    expect(diff.trace.resultHash).not.toBe(historical.trace.resultHash);
    const { trace, ...baseResult } = historical;
    const legacy = { ...baseResult, trace: { ...trace, hashVersion: undefined, resultHash: sha256(baseResult) } };
    expect(engine.calculateDifference({ ...body, inputHash, originalResult: legacy }).netAmount).toBe('0.00');
    expect(() => engine.calculateDifference({
      ...body, inputHash, originalResult: { ...historical, trace: { ...historical.trace, engineVersion: 'unknown' } },
    })).toThrow('Historical payroll result integrity check failed.');
  });
});
