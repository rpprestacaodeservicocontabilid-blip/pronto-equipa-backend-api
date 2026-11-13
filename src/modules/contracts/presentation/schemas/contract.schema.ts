import { z } from 'zod';
import { CONTRACT_STATUSES } from '../../domain/aggregates/employment-contract.aggregate';

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'Invalid calendar date.');

export const contractIdSchema = z.string().uuid();
export const contractStatusSchema = z.enum(CONTRACT_STATUSES);
export const versionSchema = z.coerce.number().int().positive();

export const createContractSchema = z.object({
  employeeId: z.string().uuid(),
  contractNumber: z.string().trim().min(1).max(50),
  typeCode: z.string().trim().min(1).max(50),
  startDate: dateOnly,
  endDate: dateOnly.nullable().default(null),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .default('AOA'),
  salaryAmount: z.coerce
    .number()
    .finite()
    .nonnegative()
    .transform((value) => value.toFixed(2))
    .nullable()
    .default(null),
  terms: z.record(z.string(), z.unknown()).default({}),
});

export const updateDraftSchema = z
  .object({
    expectedVersion: versionSchema,
    typeCode: z.string().trim().min(1).max(50).optional(),
    startDate: dateOnly.optional(),
    endDate: dateOnly.nullable().optional(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    salaryAmount: z.coerce
      .number()
      .finite()
      .nonnegative()
      .transform((value) => value.toFixed(2))
      .nullable()
      .optional(),
    terms: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedVersion'), {
    message: 'At least one contract field is required.',
  });

export const listContractsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  employeeId: z.string().uuid().optional(),
  status: contractStatusSchema.optional(),
  typeCode: z.string().trim().max(50).optional(),
});

export const expiringContractsSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const transitionSchema = z.object({
  expectedVersion: versionSchema,
  reason: z.string().trim().max(500).optional(),
});

export const rejectContractSchema = z.object({
  expectedVersion: versionSchema,
  reason: z.string().trim().min(1).max(500),
});

export const renewContractSchema = z.object({
  expectedVersion: versionSchema,
  newEndDate: dateOnly,
  reason: z.string().trim().min(1).max(500),
});

export const amendContractSchema = z.object({
  expectedVersion: versionSchema,
  effectiveDate: dateOnly,
  reason: z.string().trim().min(1).max(500),
  changes: z
    .object({
      salaryAmount: z.coerce
        .number()
        .finite()
        .nonnegative()
        .transform((value) => value.toFixed(2))
        .optional(),
      currency: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{3}$/)
        .optional(),
      terms: z.record(z.string(), z.unknown()).optional(),
    })
    .refine((value) => Object.keys(value).length > 0),
});

export const suspensionSchema = z.object({
  expectedVersion: versionSchema,
  startDate: dateOnly,
  endDate: dateOnly.nullable().optional(),
  reason: z.string().trim().min(1).max(500),
});

export const terminationSchema = z.object({
  expectedVersion: versionSchema,
  effectiveDate: dateOnly,
  reasonCode: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(1000),
});

export const documentSchema = z.object({
  documentId: z.string().trim().min(1).max(200),
  documentType: z.string().trim().min(1).max(80),
});

export const createContractTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(1).max(120),
  legalRuleVersionId: z.string().trim().max(120).nullable().default(null),
  requiresEndDate: z.boolean().default(true),
  maxRenewals: z.number().int().nonnegative().nullable().default(null),
  active: z.boolean().default(true),
});

export type CreateContractDto = z.infer<typeof createContractSchema>;
export type UpdateDraftDto = z.infer<typeof updateDraftSchema>;
