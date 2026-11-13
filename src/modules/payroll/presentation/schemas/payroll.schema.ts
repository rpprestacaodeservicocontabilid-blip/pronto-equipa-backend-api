import { z } from 'zod';
import { runTypes } from '../../domain/payroll';
export const payrollIdSchema = z.string().uuid();
export const payrollPeriodSchema = z.object({ startDate: z.string(), endDate: z.string(), paymentDate: z.string() }).strict();
export const payrollVersionSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
export const payrollRunSchema = z.object({
  periodId: payrollIdSchema, runType: z.enum(runTypes), executionScope: z.enum(['INDIVIDUAL', 'COLLECTIVE']), employeeIds: z.array(payrollIdSchema).min(1).max(5000), idempotencyKey: z.string().trim().min(1).max(100), originalRunId: payrollIdSchema.optional(), reason: z.string().trim().min(1).max(1000).optional(),
}).strict();
