import { z } from 'zod';

export const paymentIdSchema = z.string().trim().min(1);

export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.string().trim().optional(),
  })
  .strict();

export const paymentInstructionSchema = z
  .object({
    payrollResultId: z.string().trim().min(1),
    employeeId: z.string().trim().min(1),
    amount: z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/).optional(),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('AOA'),
    paymentType: z
      .enum([
        'REGULAR_SALARY',
        'INDIVIDUAL',
        'BULK',
        'OFF_CYCLE',
        'SUPPLEMENTARY',
        'RETROACTIVE',
        'CORRECTION',
        'TERMINATION',
      ])
      .optional(),
    method: z.enum(['BANK_TRANSFER', 'BULK_FILE', 'API', 'CASH']).default('BANK_TRANSFER'),
    idempotencyKey: z.string().trim().min(1).optional(),
    beneficiary: z
      .object({
        name: z.string().trim().min(1).max(180),
        accountNumber: z.string().trim().min(3).max(80),
        bankCode: z.string().trim().min(1).max(40),
      })
      .optional(),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

export const paymentBeneficiarySchema = z.object({
  name: z.string().trim().min(1).max(180),
  accountNumber: z.string().trim().min(3).max(80),
  bankCode: z.string().trim().min(1).max(40),
}).strict();

export const paymentBatchSchema = z
  .object({
    code: z.string().trim().min(1).max(80),
    sourceAccountId: z.string().trim().min(1),
    description: z.string().trim().max(2000).optional(),
  })
  .strict();

export const paymentBatchItemSchema = z
  .object({
    instructionId: z.string().trim().min(1),
    amount: z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/),
  })
  .strict();

export const batchApprovalSchema = z
  .object({
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

export const paymentPolicySchema = z.object({
  baseApprovals: z.coerce.number().int().min(1).max(10),
  highValueThreshold: z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/).optional(),
  highValueApprovals: z.coerce.number().int().min(2).max(10).optional(),
}).strict().refine((value) => Boolean(value.highValueThreshold) === Boolean(value.highValueApprovals), {
  message: 'highValueThreshold and highValueApprovals must be supplied together.',
}).refine((value) => !value.highValueApprovals || value.highValueApprovals >= value.baseApprovals, {
  message: 'highValueApprovals must be greater than or equal to baseApprovals.',
});

export const orderExecutionSchema = z
  .object({
    providerId: z.string().trim().min(1),
    paymentMethod: z.enum(['BANK_TRANSFER', 'BULK_FILE', 'API', 'CASH']).default('BANK_TRANSFER'),
  })
  .strict();

export const reconcileSchema = z
  .object({
    reference: z.string().trim().min(1),
    externalAmount: z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/),
    externalCurrency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('AOA'),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const bankAccountSchema = z
  .object({
    bankCode: z.string().trim().min(1),
    accountName: z.string().trim().min(1),
    accountIdentifier: z.string().trim().min(3).max(80),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('AOA'),
    isPrimary: z.boolean().default(false),
  })
  .strict();

export const bankAccountUpdateSchema = z
  .object({
    bankCode: z.string().trim().min(1).optional(),
    accountName: z.string().trim().min(1).optional(),
    accountIdentifier: z.string().trim().min(3).max(80).optional(),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict();

export const providerConfigurationSchema = z
  .object({
    providerId: z.string().trim().min(1),
    providerType: z.enum(['BANK', 'GATEWAY', 'FILE_PROVIDER']).default('BANK'),
    status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING']).default('ACTIVE'),
    endpoint: z.string().trim().min(1).optional(),
    capabilities: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

export const statementImportSchema = z
  .object({
    sourceAccountId: z.string().trim().min(1),
    fileName: z.string().trim().min(1),
    entries: z.array(z.object({
      externalReference: z.string().trim().min(1).max(180),
      transactionDate: z.string().datetime(),
      amount: z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/),
      currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('AOA'),
      direction: z.enum(['DEBIT', 'CREDIT']),
      description: z.string().trim().max(1000).optional(),
    }).strict()).min(1).max(10000),
    fileHash: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  })
  .strict();

export const reportRangeSchema = z
  .object({
    startDate: z.string().trim().min(1).optional(),
    endDate: z.string().trim().min(1).optional(),
  })
  .strict();

export const exportRequestSchema = z
  .object({
    format: z.enum(['PDF', 'CSV', 'XLSX']).default('PDF'),
    reportType: z.enum(['summary', 'settlements', 'failed', 'returns', 'reconciliation']).default('summary'),
  })
  .strict();
