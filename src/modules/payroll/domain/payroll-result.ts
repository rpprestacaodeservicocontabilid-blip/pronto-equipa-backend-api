import { z } from 'zod';
import { createHash } from 'crypto';
import { ValidationError } from '../../../shared/errors/app.error';
export const amountSchema = z.string().regex(/^(0|[1-9]\d{0,15})\.\d{2}$/);
export const calculationSchema = z
  .object({
    employeeId: z.string().uuid(),
    grossAmount: amountSchema,
    deductionsAmount: amountSchema,
    netAmount: amountSchema,
    employerCostsAmount: amountSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    engineVersion: z.string().min(1),
    legalRuleSetVersion: z.string().min(1),
    calculationTraceId: z.string().min(1),
    lines: z
      .array(
        z
          .object({
            code: z.string().min(1),
            type: z.enum(['EARNING', 'DEDUCTION', 'EMPLOYER_COST']),
            amount: amountSchema,
            sourceReference: z.string().min(1),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();
export const cents = (value: string): bigint => {
  if (!/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(value))
    throw new ValidationError('Invalid exact monetary amount.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};
export const money = (value: bigint): string =>
  `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, '0')}`;
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export const hash = (value: unknown): string =>
  createHash('sha256').update(stable(value)).digest('hex');
export function validateCalculation(value: unknown) {
  const result = calculationSchema.parse(value);
  const total = (type: string) =>
    result.lines
      .filter((line) => line.type === type)
      .reduce((sum, line) => sum + cents(line.amount), 0n);
  if (
    total('EARNING') !== cents(result.grossAmount) ||
    total('DEDUCTION') !== cents(result.deductionsAmount) ||
    total('EMPLOYER_COST') !== cents(result.employerCostsAmount) ||
    cents(result.grossAmount) - cents(result.deductionsAmount) !== cents(result.netAmount)
  )
    throw new ValidationError('Result lines and monetary totals do not reconcile.');
  if (
    new Set(result.lines.map((line) => `${line.type}:${line.code}:${line.sourceReference}`))
      .size !== result.lines.length
  )
    throw new ValidationError('Duplicate payroll result line.');
  return result;
}
