import { PayrollEngineError } from '../errors/payroll-engine.error';
import { PayrollEngineInput } from '../contracts/payroll-engine.contract';
import { Money } from '../value-objects/money.vo';
import { sha256 } from '../services/hash.service';

const date = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const requireText: (value: unknown, name: string) => asserts value is string = (value, name) => {
  if (typeof value !== 'string' || !value.trim())
    throw new PayrollEngineError(`Missing ${name}.`, 'INVALID_INPUT');
};

export function validateInput(input: PayrollEngineInput): void {
  if (!input || !Number.isSafeInteger(input.tenantId) || input.tenantId <= 0)
    throw new PayrollEngineError('A valid tenant context is required.', 'INVALID_TENANT');
  requireText(input.employeeId, 'employee identifier');
  requireText(input.payrollRunId, 'payroll run identifier');
  requireText(input.inputHash, 'input hash');
  requireText(input.engineVersion, 'engine version');
  if (
    !date(input.period?.startDate) ||
    !date(input.period?.endDate) ||
    input.period.startDate > input.period.endDate
  )
    throw new PayrollEngineError('Calculation period is invalid.', 'INVALID_PERIOD');
  if (input.currency !== 'AOA')
    throw new PayrollEngineError('Only AOA is supported by this rule set.', 'INVALID_CURRENCY');
  const rules = input.legalRules;
  if (
    !rules ||
    !rules.ruleSetId ||
    !rules.version ||
    rules.status !== 'PUBLISHED' ||
    rules.jurisdiction !== 'AO' ||
    !rules.sourceReference
  )
    throw new PayrollEngineError(
      'A published, versioned Angolan legal rule set is required.',
      'INVALID_RULE_SET',
    );
  if (
    !date(rules.effectiveFrom) ||
    rules.effectiveFrom > input.period.startDate ||
    (rules.effectiveTo && (!date(rules.effectiveTo) || rules.effectiveTo < input.period.endDate))
  )
    throw new PayrollEngineError(
      'Legal rules do not cover the full calculation period.',
      'RULES_OUT_OF_DATE',
    );
  if (
    rules.compatibility?.engineVersions &&
    !rules.compatibility.engineVersions.includes(input.engineVersion)
  )
    throw new PayrollEngineError(
      'Legal rules are incompatible with this engine version.',
      'RULE_ENGINE_INCOMPATIBLE',
    );
  if (input.expectedLegalRuleSetVersion && input.expectedLegalRuleSetVersion !== rules.version)
    throw new PayrollEngineError(
      'Resolved legal rules do not match the version frozen in the payroll snapshot.',
      'RULE_VERSION_MISMATCH',
    );
  if (
    !['HALF_UP', 'HALF_EVEN', 'DOWN', 'UP'].includes(rules.roundingPolicy?.mode) ||
    rules.roundingPolicy.scale !== 2
  )
    throw new PayrollEngineError(
      'Monetary rounding policy must be explicit and use two places.',
      'INVALID_ROUNDING_POLICY',
    );
  if (!['CALENDAR_DAYS', 'FIXED_PERIOD_DAYS'].includes(rules.laborRules?.prorationBasis))
    throw new PayrollEngineError('Salary proration basis is missing.', 'INVALID_LABOR_RULES');
  if (
    rules.laborRules.prorationBasis === 'FIXED_PERIOD_DAYS' &&
    (!Number.isInteger(rules.laborRules.fixedPeriodDays) ||
      (rules.laborRules.fixedPeriodDays ?? 0) < 1)
  )
    throw new PayrollEngineError(
      'Fixed period day count must be a positive integer.',
      'INVALID_LABOR_RULES',
    );
  if (
    !rules.socialSecurityRules ||
    !rules.incomeTaxRules ||
    !Array.isArray(rules.incomeTaxRules.brackets) ||
    !rules.incomeTaxRules.brackets.length
  )
    throw new PayrollEngineError(
      'Income tax and social security rules are mandatory.',
      'INCOMPLETE_RULE_SET',
    );
  const decimal = (value: string, name: string, maximum = 1000) => {
    const parsed = Money.parse(value);
    if (parsed.isNegative() || parsed.compare(Money.parse(String(maximum))) > 0)
      throw new PayrollEngineError(`Invalid ${name}.`, 'INVALID_RULE_VALUE');
  };
  decimal(rules.socialSecurityRules.employeeRate, 'employee contribution rate', 1);
  decimal(rules.socialSecurityRules.employerRate, 'employer contribution rate', 1);
  if (rules.socialSecurityRules.minimumBase)
    decimal(rules.socialSecurityRules.minimumBase, 'minimum contribution base');
  if (rules.socialSecurityRules.maximumBase)
    decimal(rules.socialSecurityRules.maximumBase, 'maximum contribution base');
  if (
    rules.socialSecurityRules.minimumBase &&
    rules.socialSecurityRules.maximumBase &&
    Money.parse(rules.socialSecurityRules.minimumBase).compare(
      Money.parse(rules.socialSecurityRules.maximumBase),
    ) > 0
  )
    throw new PayrollEngineError(
      'Minimum contribution base exceeds the maximum.',
      'INVALID_CONTRIBUTION_BASE',
    );
  if (!['PROGRESSIVE', 'MARGINAL'].includes(rules.incomeTaxRules.calculation))
    throw new PayrollEngineError('Income tax calculation method is invalid.', 'INVALID_TAX_RULES');
  decimal(rules.incomeTaxRules.exemptionAmount ?? '0', 'income tax exemption');
  for (const bracket of rules.incomeTaxRules.brackets) {
    Money.parse(bracket.from);
    if (bracket.to) Money.parse(bracket.to);
    decimal(bracket.rate, 'income tax rate', 1);
    if (bracket.deduction) decimal(bracket.deduction, 'income tax deduction');
    if (bracket.to && Money.parse(bracket.to).compare(Money.parse(bracket.from)) <= 0)
      throw new PayrollEngineError(
        'Tax bracket upper bound must exceed its lower bound.',
        'INVALID_TAX_BRACKETS',
      );
  }
  const sortedBrackets = [...rules.incomeTaxRules.brackets].sort((a, b) =>
    Money.parse(a.from).compare(Money.parse(b.from)),
  );
  if (!Money.parse(sortedBrackets[0].from).isZero() || sortedBrackets[sortedBrackets.length - 1].to)
    throw new PayrollEngineError(
      'Tax brackets must start at zero and cover all higher amounts.',
      'INCOMPLETE_TAX_BRACKETS',
    );
  for (let index = 1; index < sortedBrackets.length; index++) {
    const previous = sortedBrackets[index - 1];
    if (
      !previous.to ||
      Money.parse(sortedBrackets[index].from).compare(Money.parse(previous.to)) !== 0
    )
      throw new PayrollEngineError(
        'Income tax brackets must be contiguous and non-overlapping.',
        'INVALID_TAX_BRACKETS',
      );
  }
  decimal(rules.deductionRules.maxPercentageOfGross ?? '1', 'maximum deduction percentage', 1);
  decimal(rules.deductionRules.protectedNetAmount ?? '0', 'protected net amount');
  if (rules.laborRules.maximumDailyOvertimeHours)
    decimal(rules.laborRules.maximumDailyOvertimeHours, 'maximum daily overtime hours');
  for (const multiplier of Object.values(rules.laborRules.overtimeMultipliers ?? {}))
    decimal(multiplier, 'overtime multiplier');
  for (const multiplier of Object.values(rules.laborRules.nightWorkMultipliers ?? {}))
    decimal(multiplier, 'night work multiplier');
  for (const segment of input.segments ?? []) {
    if (
      !date(segment.startDate) ||
      !date(segment.endDate) ||
      segment.startDate > segment.endDate ||
      segment.startDate < input.period.startDate ||
      segment.endDate > input.period.endDate
    )
      throw new PayrollEngineError(
        'Salary history segment is outside the period.',
        'INVALID_SALARY_SEGMENT',
      );
    if (segment.startDate.slice(0, 7) !== segment.endDate.slice(0, 7))
      throw new PayrollEngineError(
        'Salary history segments must be split at month boundaries.',
        'INVALID_SALARY_SEGMENT',
      );
    const salary = Money.parse(segment.baseSalary);
    if (salary.isNegative())
      throw new PayrollEngineError('Base salary cannot be negative.', 'INVALID_SALARY');
    for (const component of segment.components ?? []) {
      requireText(component.code, 'component code');
      requireText(component.sourceReference, 'component source reference');
      const amount = Money.parse(component.amount);
      if (amount.isNegative())
        throw new PayrollEngineError('Component amounts cannot be negative.', 'INVALID_COMPONENT');
      if (!['EARNING', 'DEDUCTION'].includes(component.kind))
        throw new PayrollEngineError('Unsupported component kind.', 'INVALID_COMPONENT');
    }
  }
  if (!input.segments?.length)
    throw new PayrollEngineError(
      'At least one effective salary segment is required.',
      'MISSING_SALARY',
    );
  const sortedSegments = [...input.segments].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let index = 1; index < sortedSegments.length; index++) {
    if (sortedSegments[index].startDate <= sortedSegments[index - 1].endDate)
      throw new PayrollEngineError(
        'Effective salary segments overlap.',
        'OVERLAPPING_SALARY_SEGMENTS',
      );
  }
  for (const absence of input.attendance?.absences ?? []) {
    requireText(absence.code, 'absence code');
    requireText(absence.sourceReference, 'absence source reference');
    if (Money.parse(absence.amount).isNegative())
      throw new PayrollEngineError('Absence adjustments cannot be negative.', 'INVALID_ATTENDANCE');
  }
  for (const item of input.attendance?.overtime ?? []) {
    requireText(item.code, 'overtime code');
    requireText(item.sourceReference, 'overtime source reference');
    requireText(item.category, 'overtime category');
    if (Money.parse(item.hours).isNegative() || Money.parse(item.hourlyRate).isNegative())
      throw new PayrollEngineError(
        'Overtime hours and rates cannot be negative.',
        'INVALID_ATTENDANCE',
      );
    if (
      rules.laborRules.maximumDailyOvertimeHours &&
      (!date(item.workDate ?? '') ||
        item.workDate! < input.period.startDate ||
        item.workDate! > input.period.endDate)
    )
      throw new PayrollEngineError(
        'A valid work date is required to enforce the daily overtime limit.',
        'INVALID_ATTENDANCE_DATE',
      );
  }
  for (const item of input.attendance?.nightWork ?? []) {
    requireText(item.code, 'night work code');
    requireText(item.sourceReference, 'night work source reference');
    if (Money.parse(item.hours).isNegative() || Money.parse(item.hourlyRate).isNegative())
      throw new PayrollEngineError(
        'Night work hours and rates cannot be negative.',
        'INVALID_ATTENDANCE',
      );
    if (
      item.workDate &&
      (!date(item.workDate) ||
        item.workDate < input.period.startDate ||
        item.workDate > input.period.endDate)
    )
      throw new PayrollEngineError(
        'Night work date is outside the calculation period.',
        'INVALID_ATTENDANCE_DATE',
      );
  }
  for (const item of input.deductions ?? []) {
    requireText(item.code, 'deduction code');
    requireText(item.sourceReference, 'deduction source reference');
    requireText(item.category, 'deduction category');
    if (
      !Number.isSafeInteger(item.priority) ||
      item.priority < 0 ||
      Money.parse(item.requestedAmount).isNegative()
    )
      throw new PayrollEngineError(
        'Deduction amount and priority must be non-negative.',
        'INVALID_DEDUCTION',
      );
  }
  if (rules.integrityHash) {
    const { integrityHash, ...unsignedRules } = rules;
    if (sha256(unsignedRules) !== integrityHash)
      throw new PayrollEngineError(
        'Legal rule set integrity check failed.',
        'RULE_SET_HASH_MISMATCH',
      );
  }
}
