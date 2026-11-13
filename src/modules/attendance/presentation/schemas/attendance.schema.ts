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

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

export const attendanceIdSchema = z.string().uuid();
export const listAttendanceSchema = z.object({
  page,
  limit,
  employeeId: z.string().uuid().optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});
export const createPunchSchema = z.object({
  employeeId: z.string().uuid(),
  punchType: z.enum(['IN', 'OUT', 'BREAK_START', 'BREAK_END']),
  occurredAt: z.string().datetime({ offset: true }),
  workDate: dateOnly.optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  externalReference: z.string().trim().min(1).max(200).optional(),
  deviceId: z.string().trim().min(1).max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export const calculateDaySchema = z.object({ employeeId: z.string().uuid(), workDate: dateOnly });
export const createJustificationSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
  evidence: z.string().trim().max(1000).optional(),
});
export const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().max(2000).optional(),
});
export const correctionSchema = z
  .object({
    punchType: z.enum(['IN', 'OUT', 'BREAK_START', 'BREAK_END']).optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    reason: z.string().trim().min(1).max(2000),
  })
  .refine(
    (value) => value.punchType !== undefined || value.occurredAt !== undefined,
    'At least one correction field is required.',
  );
export const createCorrectionSchema = correctionSchema.extend({ recordId: z.string().uuid() });
export const createPeriodSchema = z.object({ startDate: dateOnly, endDate: dateOnly });
export const rectificationSchema = correctionSchema.extend({ recordId: z.string().uuid() });
export const attendanceReportSchema = z.object({ from: dateOnly, to: dateOnly });
export const policySchema = z.object({
  lateToleranceMinutes: z.coerce.number().int().min(0).max(1440),
  earlyDepartureToleranceMinutes: z.coerce.number().int().min(0).max(1440),
  separationOfDuties: z.boolean().default(true),
});
export const importPunchesSchema = z.object({
  batchKey: z.string().trim().min(1).max(200),
  rows: z.array(createPunchSchema).min(1).max(5000),
});
