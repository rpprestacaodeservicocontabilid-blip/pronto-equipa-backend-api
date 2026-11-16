import { z } from 'zod';
const interval = z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'CUSTOM']);
const price = z.object({
  currency: z
    .string()
    .length(3)
    .transform((s) => s.toUpperCase()),
  interval,
  amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
  customDays: z.number().int().positive().max(3650).optional(),
});
const plan = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional(),
  type: z.enum(['FREE', 'TRIAL', 'STANDARD', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM']),
  prices: z.array(price).min(1).max(10),
  features: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])),
  limits: z.record(
    z.string(),
    z.object({ value: z.string().nullable(), policy: z.enum(['HARD', 'SOFT', 'OVERAGE']) }),
  ),
});
export const idSchema = z.string().uuid();
export const planSchema = plan;
export const createSubscriptionSchema = z.object({
  planVersionId: idSchema,
  interval,
  idempotencyKey: z.string().min(8).max(180),
  trialDays: z.number().int().min(0).max(90).optional(),
});
export const trialConversionSchema = z.object({ planVersionId: idSchema, interval });
export const changeSchema = z.object({
  subscriptionId: idSchema,
  planVersionId: idSchema,
  interval: interval.optional(),
  reason: z.string().trim().min(3).max(1000),
});
export const decisionSchema = z.object({ reason: z.string().max(1000).optional() });
export const cancelSchema = z.object({
  atPeriodEnd: z.boolean().default(true),
  reason: z.string().trim().min(3).max(1000),
});
export const overrideSchema = z.object({
  subscriptionId: idSchema,
  features: z.record(z.string(), z.boolean()).optional(),
  limits: z.record(z.string(), z.string().nullable()).optional(),
  reason: z.string().min(3).max(1000),
  expiresAt: z.string().datetime().optional(),
});
export const policySchema = z
  .object({
    trialDays: z.number().int().min(0).max(90).optional(),
    graceDays: z.number().int().min(0).max(90).optional(),
    renewalNoticeDays: z.number().int().min(0).max(180).optional(),
    allowOverage: z.boolean().optional(),
    trialEligibleOnce: z.boolean().optional(),
    suspensionPolicy: z.enum(['FULL', 'READ_ONLY', 'GRACE']).optional(),
  })
  .strict();
export const billingEventSchema = z.object({
  eventId: z.string().trim().min(8).max(180),
  type: z.enum([
    'platform-billing.payment.confirmed',
    'platform-billing.payment.failed',
    'platform-billing.invoice.overdue',
  ]),
  companyId: z.number().int().positive(),
  subscriptionId: idSchema,
  invoiceId: z.string().optional(),
  reason: z.string().optional(),
});
export const listQuery = z.object({
  metricCode: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
