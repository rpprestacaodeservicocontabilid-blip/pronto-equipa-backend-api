import { z } from 'zod';

export const legalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Enter a valid date.');
const text = z.string().trim().min(1).max(1000);
const decimal = z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,6})?$/);
const officialUrl = z.string().trim().max(1000).url().refine(value => {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch { return false; }
}, 'Use an HTTP or HTTPS link.');
export const governanceSchema = z.object({
  sourceIds: z.array(z.string().uuid()).max(30).refine(ids => new Set(ids).size === ids.length).optional(),
  minimumWage: z.object({ amount: decimal, sector: text, regime: text }).strict().optional(),
  holidays: z.object({ conditions: text, multiplier: decimal.optional() }).strict().optional(),
  leave: z.object({ annualDays: z.number().int().min(0).max(366), acquisition: text, allowanceBasis: text }).strict().optional(),
  absences: z.object({ classification: text, payTreatment: text }).strict().optional(),
  termination: z.object({ conditions: text, compensationBasis: text }).strict().optional(),
}).strict();
export type LegalGovernance = z.infer<typeof governanceSchema>;

export const sourceInputSchema = z.object({
  type: z.enum(['LAW', 'DECREE', 'EXECUTIVE_DECREE', 'REGULATION', 'OTHER']),
  reference: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(250),
  issuer: z.string().trim().min(1).max(200),
  publishedOn: legalDate,
  effectiveFrom: legalDate.optional(),
  officialUrl,
  documentUrl: officialUrl.optional(),
  articles: text.optional(),
  notes: text.optional(),
  relation: z.enum(['AMENDS', 'REPEALS']).optional(),
  relatedReference: z.string().trim().min(1).max(120).optional(),
}).strict().refine(record => Boolean(record.relation) === Boolean(record.relatedReference) &&
  record.reference !== record.relatedReference, 'Supply a different related reference and its relationship.');
export type LegalSourceInput = z.infer<typeof sourceInputSchema>;
