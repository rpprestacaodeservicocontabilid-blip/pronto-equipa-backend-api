import { createHash } from 'crypto';
import { z } from 'zod';
import type { LegalGovernance } from './legal-governance';
import { ValidationError } from '../../../shared/errors/app.error';

const decimal = z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,6})?$/);
const rate = z.string().regex(/^(0(\.\d{1,6})?|1(\.0{1,6})?)$/);
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

export const legalRuleDefinitionSchema = z
  .object({
    roundingPolicy: z
      .object({ mode: z.enum(['HALF_UP', 'HALF_EVEN', 'DOWN', 'UP']), scale: z.literal(2) })
      .strict(),
    laborRules: z
      .object({
        prorationBasis: z.enum(['CALENDAR_DAYS', 'FIXED_PERIOD_DAYS']),
        fixedPeriodDays: z.number().int().positive().optional(),
        overtimeMultipliers: z.record(z.string(), decimal).optional(),
        nightWorkMultipliers: z.record(z.string(), decimal).optional(),
        maximumDailyOvertimeHours: decimal.optional(),
      })
      .strict(),
    socialSecurityRules: z
      .object({
        employeeRate: rate,
        employerRate: rate,
        includedComponentCodes: z.array(z.string().min(1)).optional(),
        excludedComponentCodes: z.array(z.string().min(1)).optional(),
        minimumBase: decimal.optional(),
        maximumBase: decimal.optional(),
      })
      .strict(),
    incomeTaxRules: z
      .object({
        includedComponentCodes: z.array(z.string().min(1)).optional(),
        excludedComponentCodes: z.array(z.string().min(1)).optional(),
        exemptionAmount: decimal.optional(),
        brackets: z
          .array(
            z
              .object({
                from: decimal,
                to: decimal.nullable().optional(),
                rate,
                deduction: decimal.optional(),
              })
              .strict(),
          )
          .min(1),
        calculation: z.enum(['PROGRESSIVE', 'MARGINAL']),
        socialSecurityDeductible: z.boolean().optional(),
      })
      .strict(),
    deductionRules: z
      .object({
        maxPercentageOfGross: rate.optional(),
        protectedNetAmount: decimal.optional(),
        allowPartial: z.boolean().optional(),
        allowedCategories: z.array(z.string().min(1)).optional(),
      })
      .strict(),
    compatibility: z
      .object({ engineVersions: z.array(z.string().min(1)) })
      .strict()
      .optional(),
  })
  .strict();

export type LegalRuleDefinition = z.infer<typeof legalRuleDefinitionSchema>;

const decimalMicros = (value: string): bigint => {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  const result = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  return negative ? -result : result;
};

export interface LegalRuleSetInput {
  companyId?: number | null;
  ruleSetId: string;
  version: string;
  jurisdiction: 'AO';
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceReference: string;
  evidenceReference: string;
  governance?: LegalGovernance | null;
  rules: LegalRuleDefinition;
}

export function validateLegalRuleSet(input: LegalRuleSetInput): LegalRuleDefinition {
  if (
    !input.ruleSetId.trim() ||
    !input.version.trim() ||
    !input.sourceReference.trim() ||
    !input.evidenceReference.trim()
  )
    throw new ValidationError('Rule set, version and legal source evidence are required.');
  if (input.jurisdiction !== 'AO')
    throw new ValidationError('Only Angolan jurisdiction (AO) is supported.');
  if (
    !dateOnly.safeParse(input.effectiveFrom).success ||
    (input.effectiveTo && !dateOnly.safeParse(input.effectiveTo).success)
  )
    throw new ValidationError('Legal rule effective dates must be valid calendar dates.');
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom)
    throw new ValidationError('Legal rule effectiveTo cannot precede effectiveFrom.');
  if (input.companyId != null && (!Number.isSafeInteger(input.companyId) || input.companyId <= 0))
    throw new ValidationError('Company scope must be a positive integer.');

  const parsed = legalRuleDefinitionSchema.safeParse(input.rules);
  if (!parsed.success)
    throw new ValidationError(
      'Legal rule definition does not match the payroll-engine contract.',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  const rules = parsed.data;
  if (rules.laborRules.prorationBasis === 'FIXED_PERIOD_DAYS' && !rules.laborRules.fixedPeriodDays)
    throw new ValidationError('FIXED_PERIOD_DAYS requires fixedPeriodDays.');
  const engineMaximum = 1_000_000_000n;
  if (
    rules.laborRules.maximumDailyOvertimeHours &&
    decimalMicros(rules.laborRules.maximumDailyOvertimeHours) > engineMaximum
  )
    throw new ValidationError('Maximum daily overtime hours exceed the engine-supported range.');
  for (const multiplier of [
    ...Object.values(rules.laborRules.overtimeMultipliers ?? {}),
    ...Object.values(rules.laborRules.nightWorkMultipliers ?? {}),
  ]) {
    if (decimalMicros(multiplier) > engineMaximum)
      throw new ValidationError('Labor multiplier exceeds the engine-supported range.');
  }
  if (
    rules.socialSecurityRules.minimumBase &&
    rules.socialSecurityRules.maximumBase &&
    decimalMicros(rules.socialSecurityRules.minimumBase) >
      decimalMicros(rules.socialSecurityRules.maximumBase)
  )
    throw new ValidationError('Minimum social-security base cannot exceed its maximum.');
  const brackets = [...rules.incomeTaxRules.brackets].sort((a, b) =>
    decimalMicros(a.from) < decimalMicros(b.from)
      ? -1
      : decimalMicros(a.from) > decimalMicros(b.from)
        ? 1
        : 0,
  );
  if (decimalMicros(brackets[0].from) !== 0n)
    throw new ValidationError('Income-tax brackets must start at zero.');
  for (let index = 0; index < brackets.length; index++) {
    const current = brackets[index];
    if (current.to && decimalMicros(current.to) <= decimalMicros(current.from))
      throw new ValidationError(
        'Every bounded tax bracket must have an upper bound greater than its lower bound.',
      );
    if (index > 0) {
      const previous = brackets[index - 1];
      if (previous.to == null || decimalMicros(current.from) !== decimalMicros(previous.to))
        throw new ValidationError('Income-tax brackets must be contiguous and non-overlapping.');
    }
  }
  if (brackets[brackets.length - 1].to != null)
    throw new ValidationError('The highest income-tax bracket must have no upper bound.');
  return rules;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashLegalRules(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}
