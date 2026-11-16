import { z } from 'zod';
export const uuidSchema = z.string().uuid();
export const uploadSchema = z.object({
  name: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().min(3).max(160),
  sizeBytes: z.coerce.number().int().positive(),
  categoryCode: z.string().trim().max(80).optional(),
  confidentiality: z
    .enum(['PUBLIC_INTERNAL', 'RESTRICTED', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL'])
    .optional(),
  checksumSha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
  idempotencyKey: z.string().trim().min(8).max(180),
  documentId: uuidSchema.optional(),
});
export const batchSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(180),
  files: z
    .array(uploadSchema.omit({ idempotencyKey: true, documentId: true }))
    .min(1)
    .max(100),
});
export const completeSchema = z.object({
  parts: z
    .array(z.object({ partNumber: z.number().int().positive(), etag: z.string().min(8).max(100) }))
    .max(10000)
    .default([]),
});
export const listSchema = z.object({
  status: z.string().optional(),
  employeeId: uuidSchema.optional(),
  categoryCode: z.string().optional(),
  search: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const metadataSchema = z
  .object({
    name: z.string().trim().min(1).max(240).optional(),
    categoryCode: z.string().max(80).nullable().optional(),
    confidentiality: z
      .enum(['PUBLIC_INTERNAL', 'RESTRICTED', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL'])
      .optional(),
    tags: z.array(z.string().max(40)).max(30).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    retentionUntil: z.string().datetime().nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
  })
  .strict();
export const validationSchema = z.object({
  notes: z.string().max(2000).optional(),
  reason: z.string().max(2000).optional(),
});
export const associationSchema = z.object({
  entityType: z.enum([
    'EMPLOYEE',
    'CONTRACT',
    'LEAVE_REQUEST',
    'ATTENDANCE',
    'LOAN',
    'PAYROLL_RUN',
    'PAYSLIP',
    'COMPANY',
  ]),
  entityId: uuidSchema,
  relationship: z.string().max(80).optional(),
});
export const holdSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  reference: z.string().max(160).optional(),
});
export const categorySchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[A-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  scope: z.enum(['EMPLOYEE', 'COMPANY']),
  confidentiality: z.enum(['PUBLIC_INTERNAL', 'RESTRICTED', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL']),
});
export const policySchema = z
  .object({
    requireValidation: z.boolean().optional(),
    defaultConfidentiality: z
      .enum(['PUBLIC_INTERNAL', 'RESTRICTED', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL'])
      .optional(),
    maxFileBytes: z.number().int().positive().optional(),
    defaultRetentionDays: z.number().int().min(0).max(36500).optional(),
  })
  .strict();
