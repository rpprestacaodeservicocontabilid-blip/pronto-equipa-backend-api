import { z } from 'zod';

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

const amount = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/);
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);
const idempotencyKey = z.string().trim().min(1).max(200);
const frequency = z.enum(['MONTHLY', 'BIWEEKLY', 'WEEKLY']);

export const loanIdSchema = z.string().uuid();
export const listApplicationsSchema = z.object({
  page,
  limit,
  employeeId: z.string().uuid().optional(),
  status: z.string().trim().min(1).max(30).optional(),
});
export const createApplicationSchema = z.object({
  employeeId: z.string().uuid(),
  loanType: z.enum(['LOAN', 'SALARY_ADVANCE', 'EXTRAORDINARY_ADVANCE']),
  requestedAmount: amount,
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase()),
  installmentCount: z.number().int().min(1).max(120),
  frequency,
  firstDueDate: dateOnly,
  annualInterestBps: z.number().int().min(0).max(100000).optional(),
  reason: z.string().trim().min(1).max(2000),
});
export const updateApplicationSchema = createApplicationSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const decideApplicationSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comments: z.string().trim().max(2000).optional(),
});
export const listLoansSchema = z.object({
  page,
  limit,
  employeeId: z.string().uuid().optional(),
  status: z.string().trim().min(1).max(30).optional(),
});
export const disbursementSchema = z.object({
  paymentReference: z.string().trim().min(1).max(200).optional(),
  idempotencyKey,
});
export const confirmDisbursementSchema = z.object({
  paymentReference: z.string().trim().min(1).max(200),
});
export const repaymentSchema = z.object({
  amount,
  source: z.string().trim().min(1).max(40),
  externalReference: z.string().trim().min(1).max(200),
  idempotencyKey,
});
export const reversalSchema = z.object({ reversalReference: z.string().trim().min(1).max(200) });
export const deductionRequestSchema = z.object({ idempotencyKey });
export const deductionConfirmationSchema = z.object({
  payrollRunId: z.string().trim().min(1).max(150),
  confirmedAmount: amount,
  idempotencyKey,
});
export const listDeductionsSchema = z.object({
  page,
  limit,
  loanId: z.string().uuid().optional(),
  status: z.string().trim().min(1).max(20).optional(),
});
export const renegotiationSchema = z.object({
  installmentCount: z.number().int().min(1).max(120),
  firstDueDate: dateOnly,
  frequency,
  reason: z.string().trim().min(1).max(2000),
});
export const renegotiationDecisionSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']) });
export const loanStatusActionSchema = z.object({ action: z.enum(['SUSPEND', 'RESUME']) });
export const policySchema = z.object({
  code: z.string().trim().min(1).max(50),
  effectiveFrom: dateOnly,
  maxAmount: amount,
  maxInstallments: z.number().int().min(1).max(120),
  maxActiveLoans: z.number().int().min(1).max(100),
  allowedTypes: z.array(z.enum(['LOAN', 'SALARY_ADVANCE', 'EXTRAORDINARY_ADVANCE'])).min(1),
  interestAllowed: z.boolean(),
  maxAnnualInterestBps: z.number().int().min(0).max(100000),
  deductionAuthorizationRequired: z.boolean(),
});
export const simulationSchema = z.object({
  loanType: z.enum(['LOAN', 'SALARY_ADVANCE', 'EXTRAORDINARY_ADVANCE']).optional(),
  requestedAmount: amount,
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase()),
  installmentCount: z.number().int().min(1).max(120),
  firstDueDate: dateOnly,
  frequency,
  annualInterestBps: z.number().int().min(0).max(100000).optional(),
});
export const reportQuerySchema = z.object({ page, limit });

export type CreateApplicationBody = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationBody = z.infer<typeof updateApplicationSchema>;
export type DecideApplicationBody = z.infer<typeof decideApplicationSchema>;
export type DisbursementBody = z.infer<typeof disbursementSchema>;
export type ConfirmDisbursementBody = z.infer<typeof confirmDisbursementSchema>;
export type RepaymentBody = z.infer<typeof repaymentSchema>;
export type ReversalBody = z.infer<typeof reversalSchema>;
export type DeductionRequestBody = z.infer<typeof deductionRequestSchema>;
export type DeductionConfirmationBody = z.infer<typeof deductionConfirmationSchema>;
export type RenegotiationBody = z.infer<typeof renegotiationSchema>;
export type RenegotiationDecisionBody = z.infer<typeof renegotiationDecisionSchema>;
export type LoanStatusActionBody = z.infer<typeof loanStatusActionSchema>;
export type PolicyBody = z.infer<typeof policySchema>;
export type SimulationBody = z.infer<typeof simulationSchema>;
