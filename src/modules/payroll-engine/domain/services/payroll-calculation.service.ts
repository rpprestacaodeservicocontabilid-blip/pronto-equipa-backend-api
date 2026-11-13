import { PayrollEngineError } from '../errors/payroll-engine.error';
import {
  PayrollCalculationLine,
  PayrollEngineInput,
  PayrollEngineResult,
  PayrollLegalRuleSet,
} from '../contracts/payroll-engine.contract';
import { Money, sumMoney } from '../value-objects/money.vo';
import { validateInput } from '../rules/rule-validator';
import { IncomeTaxCalculator } from '../calculators/income-tax.calculator';
import { SocialSecurityCalculator } from '../calculators/social-security.calculator';
import { sha256 } from './hash.service';

const inclusiveDays = (from: string, to: string): number =>
  Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;

export class PayrollCalculationService {
  constructor(
    private readonly tax = new IncomeTaxCalculator(),
    private readonly socialSecurity = new SocialSecurityCalculator(),
  ) {}

  calculate(input: PayrollEngineInput): PayrollEngineResult {
    validateInput(input);
    const rules = input.legalRules;
    const mode = rules.roundingPolicy.mode;
    const lines: PayrollCalculationLine[] = [];
    const steps: PayrollEngineResult['trace']['steps'] = [];
    const earningLines: Array<{ code: string; amount: Money; sourceReference: string }> = [];
    const componentDeductions: Array<{ code: string; amount: Money; sourceReference: string }> = [];

    for (const segment of input.segments) {
      const days = inclusiveDays(segment.startDate, segment.endDate);
      const divisor = rules.laborRules.prorationBasis === 'FIXED_PERIOD_DAYS'
        ? rules.laborRules.fixedPeriodDays!
        : new Date(Date.UTC(Number(segment.startDate.slice(0, 4)), Number(segment.startDate.slice(5, 7)), 0)).getUTCDate();
      if (days > divisor) throw new PayrollEngineError('Segment days exceed the proration denominator.', 'INVALID_SALARY_SEGMENT');
      const base = Money.parse(segment.baseSalary).multiplyFraction(BigInt(days), BigInt(divisor)).round(mode);
      const baseCode = 'BASE_SALARY';
      lines.push({ code: baseCode, type: 'EARNING', amount: base.toString(), sourceReference: `salary:${segment.startDate}:${segment.endDate}`, formula: `${segment.baseSalary} × ${days}/${divisor}` });
      const baseReference = `salary:${segment.startDate}:${segment.endDate}`;
      earningLines.push({ code: baseCode, amount: base, sourceReference: baseReference });
      steps.push({ code: 'BASE_SALARY', description: 'Base salary adjusted for the effective days in the period.', amount: base.toString(), formula: `${segment.baseSalary} × ${days}/${divisor}` });
      for (const component of segment.components) {
        let periodicAmount = Money.parse(component.amount);
        switch (component.frequency ?? 'MONTHLY') {
          case 'MONTHLY': break;
          case 'WEEKLY': periodicAmount = periodicAmount.multiplyFraction(52n, 12n); break;
          case 'BIWEEKLY': periodicAmount = periodicAmount.multiplyFraction(26n, 12n); break;
          case 'ANNUAL': periodicAmount = periodicAmount.divide(12n); break;
          case 'ONE_TIME':
            throw new PayrollEngineError('One-time salary items require an explicitly dated and idempotent payroll event.', 'ONE_TIME_COMPONENT_REQUIRES_EVENT', { sourceReference: component.sourceReference });
          default:
            throw new PayrollEngineError('Unsupported salary component frequency.', 'INVALID_COMPONENT_FREQUENCY');
        }
        const amount = periodicAmount.multiplyFraction(BigInt(days), BigInt(divisor)).round(mode);
        if (component.kind === 'EARNING') {
          if (lines.some((line) => line.code === component.code && line.sourceReference === component.sourceReference))
            throw new PayrollEngineError('Duplicate salary component source.', 'DUPLICATE_COMPONENT');
          lines.push({ code: component.code, type: 'EARNING', amount: amount.toString(), sourceReference: component.sourceReference });
          earningLines.push({ code: component.code, amount, sourceReference: component.sourceReference });
        } else {
          componentDeductions.push({ code: component.code, amount, sourceReference: component.sourceReference });
        }
      }
    }

    this.calculateTimeAdjustments(input, lines, earningLines, steps, rules);
    const gross = sumMoney(earningLines.map((line) => line.amount)).round(mode);
    const contribution = this.socialSecurity.calculate(gross, earningLines, rules.socialSecurityRules, mode);
    if (!contribution.employee.isZero()) lines.push({ code: 'INSS_EMPLOYEE', type: 'DEDUCTION', amount: contribution.employee.toString(), sourceReference: `legal:${rules.ruleSetId}:${rules.version}`, formula: `${contribution.base} × ${rules.socialSecurityRules.employeeRate}` });
    if (!contribution.employer.isZero()) lines.push({ code: 'INSS_EMPLOYER', type: 'EMPLOYER_COST', amount: contribution.employer.toString(), sourceReference: `legal:${rules.ruleSetId}:${rules.version}`, formula: `${contribution.base} × ${rules.socialSecurityRules.employerRate}` });
    steps.push({ code: 'SOCIAL_SECURITY', description: 'Employee and employer contributions from the versioned contribution base.', amount: contribution.employee.toString(), formula: `base ${contribution.base}; employee ${rules.socialSecurityRules.employeeRate}; employer ${rules.socialSecurityRules.employerRate}` });

    const incomeTax = this.tax.calculate(earningLines, rules.incomeTaxRules, contribution.employee, mode);
    if (!incomeTax.tax.isZero()) lines.push({ code: 'IRT', type: 'DEDUCTION', amount: incomeTax.tax.toString(), sourceReference: `legal:${rules.ruleSetId}:${rules.version}`, formula: `taxable base ${incomeTax.taxable}; brackets ${rules.incomeTaxRules.brackets.length}` });
    steps.push({ code: 'INCOME_TAX', description: 'Income tax withheld using the versioned tax brackets.', amount: incomeTax.tax.toString(), formula: `taxable base ${incomeTax.taxable}; method ${rules.incomeTaxRules.calculation}` });

    const statutory = contribution.employee.add(incomeTax.tax).round(mode);
    const authorizedRequested = [
      ...componentDeductions.map((item) => ({ code: item.code, requestedAmount: item.amount.toString(), priority: 0, sourceReference: item.sourceReference, authorized: true, category: 'SALARY_COMPONENT' })),
      ...(input.deductions ?? []),
    ].filter((item) => item.authorized).sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code));
    const unauthorized = (input.deductions ?? []).filter((item) => !item.authorized);
    const issues = unauthorized.map((item) => ({ severity: 'WARNING' as const, code: 'UNAUTHORIZED_DEDUCTION_IGNORED', message: 'An unauthorised deduction was excluded from this calculation.', sourceReference: item.sourceReference }));
    let available = gross.subtract(statutory).max(Money.zero());
    const protectedNet = Money.parse(rules.deductionRules.protectedNetAmount ?? '0');
    available = available.subtract(protectedNet).max(Money.zero());
    if (rules.deductionRules.maxPercentageOfGross) {
      const percentageLimit = gross.multiplyRate(rules.deductionRules.maxPercentageOfGross).round(mode);
      available = available.min(percentageLimit);
    }
    for (const item of authorizedRequested) {
      if (rules.deductionRules.allowedCategories && !rules.deductionRules.allowedCategories.includes(item.category)) {
        issues.push({ severity: 'WARNING', code: 'DEDUCTION_CATEGORY_NOT_ALLOWED', message: 'A deduction category is not enabled by the applicable rule set.', sourceReference: item.sourceReference });
        continue;
      }
      const requested = Money.parse(item.requestedAmount).round(mode);
      if (requested.isNegative()) throw new PayrollEngineError('Requested deductions cannot be negative.', 'INVALID_DEDUCTION');
      const applied = rules.deductionRules.allowPartial === false ? (requested.compare(available) <= 0 ? requested : Money.zero()) : requested.min(available);
      const remaining = requested.subtract(applied).max(Money.zero());
      if (!applied.isZero() || !remaining.isZero()) lines.push({ code: item.code, type: 'DEDUCTION', amount: applied.toString(), requestedAmount: requested.toString(), remainingAmount: remaining.toString(), sourceReference: item.sourceReference });
      if (!remaining.isZero()) issues.push({ severity: 'WARNING', code: 'DEDUCTION_PARTIALLY_APPLIED', message: 'The requested deduction exceeded the available payroll deduction limit.', sourceReference: item.sourceReference });
      available = available.subtract(applied).max(Money.zero());
      steps.push({ code: `DEDUCTION:${item.code}`, description: 'Authorised deduction allocated by priority after statutory deductions.', amount: applied.toString(), formula: `requested ${requested}; remaining ${remaining}` });
    }

    const totalDeductions = sumMoney(lines.filter((line) => line.type === 'DEDUCTION').map((line) => Money.parse(line.amount))).round(mode);
    const otherDeductions = totalDeductions.subtract(statutory).max(Money.zero()).round(mode);
    const net = gross.subtract(totalDeductions).round(mode);
    if (net.isNegative()) throw new PayrollEngineError('Statutory deductions exceed the available gross remuneration.', 'NEGATIVE_NET_PAY');
    const employerCosts = sumMoney(lines.filter((line) => line.type === 'EMPLOYER_COST').map((line) => Money.parse(line.amount))).round(mode);
    const totalEmployerCost = gross.add(employerCosts).round(mode);
    this.reconcile(lines, gross, totalDeductions, net, employerCosts);

    const calculationTraceId = sha256({ tenantId: input.tenantId, payrollRunId: input.payrollRunId, employeeId: input.employeeId, inputHash: input.inputHash, engineVersion: input.engineVersion }).slice(0, 32);
    const baseResult = {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      payrollRunId: input.payrollRunId,
      grossAmount: gross.toString(),
      taxableAmount: incomeTax.taxable.toString(),
      contributionBase: contribution.base.toString(),
      employeeSocialSecurity: contribution.employee.toString(),
      employerSocialSecurity: contribution.employer.toString(),
      incomeTax: incomeTax.tax.toString(),
      otherDeductions: otherDeductions.toString(),
      totalDeductions: totalDeductions.toString(),
      netAmount: net.toString(),
      employerCostsAmount: employerCosts.toString(),
      totalEmployerCost: totalEmployerCost.toString(),
      currency: input.currency,
      lines,
      issues,
    };
    return {
      ...baseResult,
      trace: {
        calculationTraceId,
        inputHash: input.inputHash,
        resultHash: sha256(baseResult),
        engineVersion: input.engineVersion,
        legalRuleSetId: rules.ruleSetId,
        legalRuleSetVersion: rules.version,
        legalSourceReference: rules.sourceReference,
        steps,
      },
    };
  }

  simulate(input: PayrollEngineInput): PayrollEngineResult { return this.calculate(input); }

  calculateDifference(input: PayrollEngineInput): PayrollEngineResult {
    if (!input.originalResult) throw new PayrollEngineError('Historical result is required for a retroactive calculation.', 'ORIGINAL_RESULT_REQUIRED');
    const recalculated = this.calculate(input);
    const original = input.originalResult;
    if (original.tenantId !== input.tenantId || original.employeeId !== input.employeeId || original.currency !== input.currency)
      throw new PayrollEngineError('Original payroll result does not match the current tenant, employee or currency.', 'ORIGINAL_RESULT_MISMATCH');
    const { trace: originalTrace, ...originalBase } = original;
    if (!originalTrace?.resultHash || sha256(originalBase) !== originalTrace.resultHash)
      throw new PayrollEngineError('Historical payroll result integrity check failed.', 'ORIGINAL_RESULT_HASH_MISMATCH');
    const fields = ['grossAmount', 'taxableAmount', 'contributionBase', 'employeeSocialSecurity', 'employerSocialSecurity', 'incomeTax', 'otherDeductions', 'totalDeductions', 'netAmount', 'employerCostsAmount', 'totalEmployerCost'] as const;
    const differences = Object.fromEntries(fields.map((field) => [field, Money.parse(recalculated[field]).subtract(Money.parse(original[field])).toString()]));
    const deltaLines = this.diffLines(original.lines, recalculated.lines);
    return {
      ...recalculated,
      ...differences,
      lines: deltaLines,
      trace: { ...recalculated.trace, steps: [...recalculated.trace.steps, { code: 'RETROACTIVE_DIFFERENCE', description: 'Difference between recalculated and immutable historical payroll result.', formula: `original ${original.trace.resultHash}; recalculated ${recalculated.trace.resultHash}` }] },
    };
  }

  explain(result: PayrollEngineResult): PayrollEngineResult['trace'] { return result.trace; }

  private calculateTimeAdjustments(input: PayrollEngineInput, lines: PayrollCalculationLine[], earnings: Array<{ code: string; amount: Money; sourceReference: string }>, steps: PayrollEngineResult['trace']['steps'], rules: PayrollLegalRuleSet) {
    if (rules.laborRules.maximumDailyOvertimeHours) {
      const dailyHours = new Map<string, Money>();
      for (const item of input.attendance?.overtime ?? []) {
        const workDate = item.workDate!;
        dailyHours.set(workDate, (dailyHours.get(workDate) ?? Money.zero()).add(Money.parse(item.hours)));
      }
      const limit = Money.parse(rules.laborRules.maximumDailyOvertimeHours);
      for (const [workDate, hours] of dailyHours) {
        if (hours.compare(limit) > 0)
          throw new PayrollEngineError('Daily overtime limit exceeded.', 'DAILY_OVERTIME_LIMIT_EXCEEDED', { workDate, hours: hours.toString(), limit: limit.toString() });
      }
    }
    for (const absence of input.attendance?.absences ?? []) {
      const amount = Money.parse(absence.amount).round(rules.roundingPolicy.mode);
      if (amount.isZero()) continue;
      let remaining = amount;
      for (let index = lines.length - 1; index >= 0 && !remaining.isZero(); index--) {
        const line = lines[index];
        if (line.type !== 'EARNING' || line.code !== 'BASE_SALARY') continue;
        const lineAmount = Money.parse(line.amount);
        const reduction = lineAmount.min(remaining);
        const adjusted = lineAmount.subtract(reduction);
        line.amount = adjusted.toString();
        const earning = earnings.find((item) => item.code === line.code && item.sourceReference === line.sourceReference);
        if (earning) earning.amount = adjusted;
        remaining = remaining.subtract(reduction);
      }
      if (!remaining.isZero()) throw new PayrollEngineError('Absence adjustment exceeds the salary earned in the period.', 'ABSENCE_EXCEEDS_EARNINGS');
      steps.push({ code: absence.code, description: `Absence adjustment applied to base remuneration (${absence.authorized ? 'authorised' : 'unjustified'} occurrence).`, amount: amount.toString(), formula: `base remuneration − ${amount}` });
    }
    for (const overtime of input.attendance?.overtime ?? []) {
      if (!overtime.authorized) throw new PayrollEngineError('Unauthorised overtime cannot be calculated.', 'UNAUTHORIZED_OVERTIME');
      const multiplier = rules.laborRules.overtimeMultipliers?.[overtime.category];
      if (!multiplier) throw new PayrollEngineError('No versioned overtime multiplier exists for this category.', 'OVERTIME_RULE_MISSING');
      const amount = Money.parse(overtime.hours).multiplyRate(overtime.hourlyRate).multiplyRate(multiplier).round(rules.roundingPolicy.mode);
      lines.push({ code: overtime.code, type: 'EARNING', amount: amount.toString(), sourceReference: overtime.sourceReference, formula: `${overtime.hours} × ${overtime.hourlyRate} × ${multiplier}` });
      earnings.push({ code: overtime.code, amount, sourceReference: overtime.sourceReference });
    }
    for (const night of input.attendance?.nightWork ?? []) {
      const multiplier = rules.laborRules.nightWorkMultipliers?.[night.code] ?? rules.laborRules.nightWorkMultipliers?.DEFAULT;
      if (!multiplier) throw new PayrollEngineError('No versioned night work multiplier exists.', 'NIGHT_WORK_RULE_MISSING');
      const amount = Money.parse(night.hours).multiplyRate(night.hourlyRate).multiplyRate(multiplier).round(rules.roundingPolicy.mode);
      lines.push({ code: night.code, type: 'EARNING', amount: amount.toString(), sourceReference: night.sourceReference, formula: `${night.hours} × ${night.hourlyRate} × ${multiplier}` });
      earnings.push({ code: night.code, amount, sourceReference: night.sourceReference });
    }
  }

  private reconcile(lines: PayrollCalculationLine[], gross: Money, deductions: Money, net: Money, employerCosts: Money) {
    const total = (kind: PayrollCalculationLine['type']) => sumMoney(lines.filter((line) => line.type === kind).map((line) => Money.parse(line.amount))).round('HALF_UP');
    if (total('EARNING').compare(gross) !== 0 || total('DEDUCTION').compare(deductions) !== 0 || total('EMPLOYER_COST').compare(employerCosts) !== 0 || gross.subtract(deductions).compare(net) !== 0)
      throw new PayrollEngineError('Calculated totals do not reconcile with their payroll lines.', 'RECONCILIATION_FAILED');
  }

  private diffLines(previous: PayrollEngineResult['lines'], current: PayrollEngineResult['lines']): PayrollCalculationLine[] {
    const key = (line: PayrollCalculationLine) => `${line.type}:${line.code}:${line.sourceReference}`;
    const oldMap = new Map(previous.map((line) => [key(line), Money.parse(line.amount)]));
    const newMap = new Map(current.map((line) => [key(line), line]));
    const output: PayrollCalculationLine[] = [];
    for (const line of current) {
      const delta = Money.parse(line.amount).subtract(oldMap.get(key(line)) ?? Money.zero());
      if (delta.isZero()) continue;
      output.push({ ...line, amount: delta.isNegative() ? delta.multiplyRate('-1').toString() : delta.toString(), type: delta.isNegative() ? (line.type === 'EMPLOYER_COST' ? 'EMPLOYER_COST' : 'DEDUCTION') : line.type });
    }
    for (const line of previous) {
      if (newMap.has(key(line))) continue;
      const amount = Money.parse(line.amount);
      if (amount.isZero()) continue;
      output.push({ code: `REVERSAL_${line.code}`, type: line.type === 'EMPLOYER_COST' ? 'EMPLOYER_COST' : 'DEDUCTION', amount: amount.toString(), sourceReference: `retroactive:${line.sourceReference}` });
    }
    return output;
  }
}
