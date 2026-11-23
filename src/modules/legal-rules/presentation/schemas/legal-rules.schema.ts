import { z } from 'zod';
import { legalRuleDefinitionSchema } from '../../domain/legal-rule-set';

import { governanceSchema } from '../../domain/legal-governance';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const legalRuleIdSchema = z.string().uuid();
export const legalRuleStatusSchema = z.enum([
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'RETIRED',
  'REJECTED',
]);

export const createLegalRuleSetSchema = z
  .object({
    companyId: z.number().int().positive().nullable().optional(),
    ruleSetId: z.string().trim().min(1).max(100),
    version: z.string().trim().min(1).max(50),
    jurisdiction: z.literal('AO').default('AO'),
    effectiveFrom: dateOnly,
    effectiveTo: dateOnly.nullable().default(null),
    sourceReference: z.string().trim().min(1).max(500),
    evidenceReference: z.string().trim().min(1).max(1000),
    rules: legalRuleDefinitionSchema,
    governance: governanceSchema.nullable().optional(),
  })
  .strict();

export const updateLegalRuleSetSchema = z
  .object({
    effectiveFrom: dateOnly.optional(),
    effectiveTo: dateOnly.nullable().optional(),
    sourceReference: z.string().trim().min(1).max(500).optional(),
    evidenceReference: z.string().trim().min(1).max(1000).optional(),
    rules: legalRuleDefinitionSchema.optional(),
    governance: governanceSchema.nullable().optional(),
    expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some(key => key !== 'expectedUpdatedAt'), 'At least one field is required.');

export const listLegalRuleSetsSchema = z
  .object({
    companyId: z.coerce.number().int().positive().optional(),
    jurisdiction: z.literal('AO').optional(),
    status: legalRuleStatusSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const transitionLegalRuleSchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict().default({});
export const rejectLegalRuleSchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  reason: z.string().trim().min(1).max(1000),
}).strict();

export const resolveLegalRuleSetSchema = z
  .object({
    companyId: z.number().int().positive(),
    startDate: dateOnly,
    endDate: dateOnly,
  })
  .strict()
  .refine(
    (value) => value.startDate <= value.endDate,
    'startDate must be before or equal to endDate.',
  );

export type CreateLegalRuleSetBody = z.infer<typeof createLegalRuleSetSchema>;
export type UpdateLegalRuleSetBody = z.infer<typeof updateLegalRuleSetSchema>;
