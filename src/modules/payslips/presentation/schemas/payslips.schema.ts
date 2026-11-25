import { z } from 'zod';

export const payslipIdSchema = z.string().trim().min(1);
export const employeeUserLinkSchema = z
  .object({ userId: z.coerce.number().int().positive() })
  .strict();
export const payslipPolicySchema = z
  .object({
    retentionDays: z.number().int().min(1).max(36500).nullable(),
    allowWorkerDownload: z.boolean(),
    notifyWorkerOnPublish: z.boolean(),
    requireManualPublication: z.boolean(),
  })
  .strict();

export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.string().trim().optional(),
    employeeId: z.string().trim().optional(),
    type: z.string().trim().optional(),
  })
  .strict();

export const generatePayslipSchema = z
  .object({
    payrollRunId: z.string().trim().min(1),
    payrollResultId: z.string().trim().min(1),
    employeeId: z.string().trim().min(1),
    templateVersionId: z.string().trim().min(1),
    type: z
      .enum([
        'REGULAR',
        'OFF_CYCLE',
        'SUPPLEMENTARY',
        'RETROACTIVE',
        'TERMINATION',
      ])
      .default('REGULAR'),
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

export const createPayslipBatchSchema = z
  .object({
    payrollRunId: z.string().trim().min(1),
    templateVersionId: z.string().trim().min(1),
    type: z
      .enum(['REGULAR', 'OFF_CYCLE', 'SUPPLEMENTARY', 'RETROACTIVE', 'TERMINATION'])
      .default('REGULAR'),
    employeeIds: z.array(z.string().uuid()).min(1).max(500),
  })
  .strict();

export const publishSchema = z
  .object({
    publishedBy: z.string().trim().min(1).optional(),
    channel: z.string().trim().max(100).optional(),
  })
  .strict();

export const templateSchema = z
  .object({
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().max(2000).optional(),
  })
  .strict();

export const templateVersionSchema = z
  .object({
    templateId: z.string().trim().min(1),
    version: z.string().trim().min(1),
    layoutConfig: z.record(z.string(), z.any()).default({}),
    logoUrl: z.string().trim().url().optional(),
  })
  .strict();

export const previewTemplateSchema = z
  .object({
    templateId: z.string().trim().min(1),
    version: z.string().trim().min(1),
  })
  .strict();

export const previewTemplateVersionBodySchema = z
  .object({
    version: z.string().trim().min(1),
  })
  .strict();

export const correctionSchema = z
  .object({
    reason: z.string().trim().min(1),
    payrollRunId: z.string().uuid(),
    payrollResultId: z.string().uuid(),
    templateVersionId: z.string().uuid(),
  })
  .strict();

export const exportReportSchema = z
  .object({
    format: z.enum(['PDF', 'CSV', 'XLSX']).default('PDF'),
    reportType: z
      .enum(['summary', 'emissions', 'pending', 'failed', 'publication'])
      .default('summary'),
  })
  .strict();
