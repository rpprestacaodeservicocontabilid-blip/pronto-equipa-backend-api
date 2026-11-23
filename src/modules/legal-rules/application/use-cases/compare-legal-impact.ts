import { z } from 'zod';
import { AppError, ValidationError } from '../../../../shared/errors/app.error';
import { CalculatePayrollUseCase } from '../../../payroll-engine/application/use-cases/calculate-payroll.use-case';
import { PAYROLL_ENGINE_VERSION, PayrollEngineInput, PayrollEngineResult, PayrollLegalRuleSet } from '../../../payroll-engine/domain/contracts/payroll-engine.contract';
import { PayrollEngineError } from '../../../payroll-engine/domain/errors/payroll-engine.error';
import { hashCalculationInput } from '../../../payroll-engine/domain/services/hash.service';
import { Money } from '../../../payroll-engine/domain/value-objects/money.vo';
import { LegalRuleSetInput, validateLegalRuleSet } from '../../domain/legal-rule-set';
import { LegalRulesRepositoryPort } from '../ports/legal-rules.repository.port';

const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const salary = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/);
export const legalImpactSchema = z.object({
  baselineId: z.string().uuid(),
  proposalId: z.string().uuid(),
  baselineMonth: month,
  proposalMonth: month,
  salaries: z.array(salary).min(1).max(25),
}).strict().refine(input => input.baselineId !== input.proposalId, 'Choose two different versions.');

type CaseInput = z.infer<typeof legalImpactSchema>;
const metrics = ['incomeTax', 'employeeSocialSecurity', 'employerSocialSecurity', 'netAmount', 'totalEmployerCost'] as const;
type Totals = Pick<PayrollEngineResult, typeof metrics[number]>;
const totals = (result: PayrollEngineResult) => Object.fromEntries(metrics.map(key => [key, result[key]])) as Totals;

export async function compareLegalImpact(repository: LegalRulesRepositoryPort, input: CaseInput) {
  const [baseline, proposal] = await Promise.all([
    repository.getView(input.baselineId), repository.getView(input.proposalId),
  ]) as [LegalRuleSetInput & { status: string }, LegalRuleSetInput & { status: string }];
  if (baseline.jurisdiction !== proposal.jurisdiction || baseline.companyId !== proposal.companyId)
    throw new ValidationError('Both versions must have the same jurisdiction and scope.');
  const calculator = new CalculatePayrollUseCase();
  const scenario = (version: LegalRuleSetInput, monthValue: string, amount: string) => {
    const [year, index] = monthValue.split('-').map(Number);
    const period = { startDate: monthValue + '-01', endDate: monthValue + '-' + new Date(Date.UTC(year, index, 0)).getUTCDate() };
    const rules: PayrollLegalRuleSet = {
      ...validateLegalRuleSet(version), ruleSetId: version.ruleSetId, version: version.version,
      jurisdiction: 'AO', status: 'PUBLISHED', effectiveFrom: version.effectiveFrom, effectiveTo: version.effectiveTo,
      sourceReference: version.sourceReference,
    };
    const snapshot: Omit<PayrollEngineInput, 'inputHash' | 'calculationInputHash'> = {
      tenantId: version.companyId ?? 1, employeeId: 'legal-impact-fixture', payrollRunId: 'legal-impact-simulation',
      currency: 'AOA', engineVersion: PAYROLL_ENGINE_VERSION, period, legalRules: rules,
      segments: [{ ...period, baseSalary: amount, components: [] }],
    };
    const inputHash = hashCalculationInput(snapshot);
    try {
      return totals(calculator.simulate({ ...snapshot, inputHash, calculationInputHash: inputHash }));
    } catch (error) {
      if (error instanceof PayrollEngineError)
        throw new AppError(version.ruleSetId + ' · ' + version.version + ' — ' + error.message, 422, error.code);
      throw error;
    }
  };
  return {
    engineVersion: PAYROLL_ENGINE_VERSION, currency: 'AOA' as const,
    rows: input.salaries.map(amount => {
      const before = scenario(baseline, input.baselineMonth, amount);
      const after = scenario(proposal, input.proposalMonth, amount);
      const difference = Object.fromEntries(metrics.map(key =>
        [key, Money.parse(after[key]).subtract(Money.parse(before[key])).toString()])) as Totals;
      return { salary: amount, baseline: before, proposal: after, difference };
    }),
  };
}
