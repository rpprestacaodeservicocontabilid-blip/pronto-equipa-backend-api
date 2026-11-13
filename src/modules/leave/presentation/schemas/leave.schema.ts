import { z } from 'zod';
import { LEAVE_STATUSES } from '../../domain/value-objects/leave-status.vo';

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

export const leaveIdSchema = z.string().uuid();
export const accountIdSchema = z.string().uuid();
export const employeeIdSchema = z.string().uuid();
export const versionSchema = z.coerce.number().int().positive();
export const leaveTypeSchema = z.enum([
  'ANNUAL',
  'SICK',
  'SPECIAL',
  'UNPAID',
  'OTHER',
]);
export const leaveStatusSchema = z.enum(LEAVE_STATUSES);
export const movementTypeSchema = z.enum([
  'ACCRUAL',
  'ADJUSTMENT',
  'RESERVATION',
  'RELEASE',
  'USAGE',
]);

// ----------------------------------------------------------
// Contas, direitos e saldos
// ----------------------------------------------------------

export const createAccountSchema = z.object({
  employeeId: employeeIdSchema,
});

export const accrueEntitlementSchema = z
  .object({
    accrualPeriodStart: dateOnly,
    accrualPeriodEnd: dateOnly,
    days: z.coerce.number().int().min(1).max(366),
    legalRuleVersionId: z.string().trim().max(120).nullable().optional(),
  })
  .refine((value) => value.accrualPeriodEnd >= value.accrualPeriodStart, {
    message: 'Accrual period end cannot precede its start.',
    path: ['accrualPeriodEnd'],
  });

export const recalculateEntitlementsSchema = accrueEntitlementSchema;

export const adjustBalanceSchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value) => value !== 0, 'Adjustment days cannot be zero.')
    .refine((value) => Math.abs(value) <= 3660, 'Adjustment is out of range.'),
  reason: z.string().trim().min(1).max(500),
  referenceId: leaveIdSchema.nullable().optional(),
});

export const listAccountsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  employeeId: employeeIdSchema.optional(),
  status: z.enum(['ACTIVE', 'CLOSED']).optional(),
});

export const listMovementsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  movementType: movementTypeSchema.optional(),
});

// ----------------------------------------------------------
// Pedidos de férias
// ----------------------------------------------------------

const segmentSchema = z.object({
  startDate: dateOnly,
  endDate: dateOnly,
});

const segmentsSchema = z
  .array(segmentSchema)
  .min(1, 'A leave request requires at least one period.')
  .max(20, 'A leave request cannot have more than 20 periods.')
  .superRefine((segments, ctx) => {
    for (let i = 0; i < segments.length; i += 1) {
      if (segments[i].endDate < segments[i].startDate) {
        ctx.addIssue({
          code: 'custom',
          message: 'Leave end date cannot be before the start date.',
          path: [i, 'endDate'],
        });
      }
      for (let j = i + 1; j < segments.length; j += 1) {
        if (segments[i].startDate <= segments[j].endDate && segments[j].startDate <= segments[i].endDate) {
          ctx.addIssue({
            code: 'custom',
            message: 'Leave periods inside one request cannot overlap.',
            path: [j, 'startDate'],
          });
        }
      }
    }
  });

export const createLeaveRequestSchema = z.object({
  employeeId: employeeIdSchema,
  leaveType: leaveTypeSchema.optional(),
  reason: z.string().trim().max(1000).nullable().optional(),
  segments: segmentsSchema,
});

export const updateLeaveRequestSchema = z
  .object({
    expectedVersion: versionSchema,
    leaveType: leaveTypeSchema.optional(),
    reason: z.string().trim().max(1000).nullable().optional(),
    segments: segmentsSchema.optional(),
  })
  .refine(
    (value) => value.leaveType !== undefined || value.reason !== undefined || value.segments !== undefined,
    { message: 'At least one leave field is required.' },
  );

export const listLeaveRequestsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  employeeId: employeeIdSchema.optional(),
  status: leaveStatusSchema.optional(),
  leaveType: leaveTypeSchema.optional(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
});

export const submitLeaveSchema = z.object({
  expectedVersion: versionSchema,
});

export const approveLeaveSchema = z.object({
  expectedVersion: versionSchema,
  comments: z.string().trim().max(1000).nullable().optional(),
});

export const rejectLeaveSchema = z.object({
  expectedVersion: versionSchema,
  comments: z.string().trim().min(1, 'Rejections require a justification.').max(1000),
});

export const returnLeaveSchema = z.object({
  expectedVersion: versionSchema,
  comments: z.string().trim().max(1000).nullable().optional(),
});

export const versionOnlySchema = z.object({
  expectedVersion: versionSchema,
});

export const rescheduleLeaveSchema = z.object({
  expectedVersion: versionSchema,
  segments: segmentsSchema,
});

export const interruptLeaveSchema = z.object({
  expectedVersion: versionSchema,
  startDate: dateOnly,
  endDate: dateOnly,
  reason: z.string().trim().min(1).max(500),
});

export const completeLeaveSchema = z.object({
  expectedVersion: versionSchema,
  usedDays: z.coerce.number().int().min(1).max(366).optional(),
});

// ----------------------------------------------------------
// Planeamento e relatórios
// ----------------------------------------------------------

export const conflictQuerySchema = z
  .object({
    employeeId: employeeIdSchema,
    startDate: dateOnly,
    endDate: dateOnly,
    excludeRequestId: leaveIdSchema.optional(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'End date cannot be before the start date.',
    path: ['endDate'],
  });

export const calendarQuerySchema = z
  .object({
    startDate: dateOnly,
    endDate: dateOnly,
    establishmentId: leaveIdSchema.optional(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'End date cannot be before the start date.',
    path: ['endDate'],
  });

export const absencesQuerySchema = z.object({
  date: dateOnly,
});

export const balancesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  employeeId: employeeIdSchema.optional(),
});

export const takenDaysQuerySchema = z.object({
  employeeId: employeeIdSchema.optional(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
});
