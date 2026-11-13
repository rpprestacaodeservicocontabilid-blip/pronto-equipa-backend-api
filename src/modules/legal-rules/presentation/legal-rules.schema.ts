import { z } from 'zod';
import { legalRuleDefinitionSchema } from '../domain/legal-rule-set';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const legalRuleIdSchema = z.string().uuid();
export const legalRuleStatusSchema = z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'RETIRED']);

export const createLegalRuleSetSchema = z.object({
  companyId: z.number().int().positive().nullable().optional(),
  ruleSetId: z.string().trim().min(1).max(100),
  version: z.string().trim().min(1).max(50),
  jurisdiction: z.literal('AO').default('AO'),
  effectiveFrom: dateOnly,
  effectiveTo: dateOnly.nullable().default(null),
  sourceReference: z.string().trim().min(1).max(500),
  evidenceReference: z.string().trim().min(1).max(1000),
  rules: legalRuleDefinitionSchema,
}).strict();

export const updateLegalRuleSetSchema = z.object({
  effectiveFrom: dateOnly.optional(),
  effectiveTo: dateOnly.nullable().optional(),
  sourceReference: z.string().trim().min(1).max(500).optional(),
  evidenceReference: z.string().trim().min(1).max(1000).optional(),
  rules: legalRuleDefinitionSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const listLegalRuleSetsSchema = z.object({
  companyId: z.coerce.number().int().positive().optional(),
  jurisdiction: z.literal('AO').optional(),
  status: legalRuleStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const resolveLegalRuleSetSchema = z.object({
  companyId: z.number().int().positive(),
  startDate: dateOnly,
  endDate: dateOnly,
}).strict().refine((value) => value.startDate <= value.endDate, 'startDate must be before or equal to endDate.');

export type CreateLegalRuleSetBody = z.infer<typeof createLegalRuleSetSchema>;
export type UpdateLegalRuleSetBody = z.infer<typeof updateLegalRuleSetSchema>;
