import { z } from 'zod';
import { OrganizationEntityType } from '../../domain/services/organization-validation.service';
import { OrganizationRecordInput } from '../../domain/repositories/organization.repository';

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

const id = z.string().uuid();
const code = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const name = z.string().trim().min(1).max(150);
const baseFields = {
  code,
  name,
  parentId: id.nullable().optional(),
  effectiveFrom: dateOnly.nullable().optional(),
  effectiveTo: dateOnly.nullable().optional(),
  employeeId: id.nullable().optional(),
  relatedId: id.nullable().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
};

const schemas: Record<OrganizationEntityType, z.ZodTypeAny> = {
  DEPARTMENT: z.object({
    ...baseFields,
    parentId: id.nullable().optional(),
    data: z
      .object({
        establishmentId: id.nullable().optional(),
        managerEmployeeId: id.nullable().optional(),
        description: z.string().max(1000).optional(),
      })
      .passthrough()
      .default({}),
  }),
  JOB_FUNCTION: z.object({
    ...baseFields,
    relatedId: id.nullable().optional(),
    data: z
      .object({
        description: z.string().max(2000).optional(),
        category: z.string().max(100).optional(),
        requirements: z.array(z.string().max(250)).max(50).optional(),
        hierarchicalLevel: z.number().int().min(0).max(100).optional(),
      })
      .passthrough()
      .default({}),
  }),
  JOB_POSITION: z.object({
    ...baseFields,
    relatedId: id,
    data: z
      .object({
        departmentId: id.nullable().optional(),
        hierarchicalLevel: z.number().int().min(0).max(100).optional(),
        description: z.string().max(1000).optional(),
      })
      .passthrough()
      .default({}),
  }),
  PROFESSIONAL_CATEGORY: z.object({
    ...baseFields,
    data: z
      .object({
        classification: z.string().max(100).optional(),
        description: z.string().max(1000).optional(),
      })
      .passthrough()
      .default({}),
  }),
  COST_CENTER: z.object({
    ...baseFields,
    parentId: id.nullable().optional(),
    data: z
      .object({
        establishmentId: id.nullable().optional(),
        description: z.string().max(1000).optional(),
      })
      .passthrough()
      .default({}),
  }),
  COST_ALLOCATION: z.object({
    ...baseFields,
    employeeId: id,
    relatedId: id,
    percentage: z.coerce.number().positive().max(100),
    effectiveFrom: dateOnly,
    effectiveTo: dateOnly.nullable().optional(),
  }),
  ESTABLISHMENT: z.object({
    ...baseFields,
    data: z
      .object({
        establishmentType: z.enum(['HEADQUARTERS', 'BRANCH', 'DELEGATION', 'OPERATIONAL_SITE']),
        province: z.string().trim().min(1).max(100),
        municipality: z.string().trim().min(1).max(100),
        address: z.string().trim().max(500).optional(),
        email: z.string().email().max(255).nullable().optional(),
        phone: z.string().max(40).nullable().optional(),
        responsibleEmployeeId: id.nullable().optional(),
        openedAt: dateOnly.nullable().optional(),
        closedAt: dateOnly.nullable().optional(),
      })
      .passthrough(),
  }),
  WORK_CALENDAR: z.object({
    ...baseFields,
    effectiveFrom: dateOnly,
    effectiveTo: dateOnly.nullable().optional(),
    data: z
      .object({
        establishmentId: id.nullable().optional(),
        workingWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        legalRuleVersionId: z.string().max(120).nullable().optional(),
        description: z.string().max(1000).optional(),
      })
      .passthrough(),
  }),
  CALENDAR_EXCEPTION: z.object({
    ...baseFields,
    parentId: id,
    effectiveFrom: dateOnly,
    data: z
      .object({
        dayType: z.enum(['HOLIDAY', 'REST_DAY', 'WORKING_DAY', 'SPECIAL']),
        description: z.string().trim().min(1).max(250),
      })
      .passthrough(),
  }),
  WORK_SCHEDULE: z.object({
    ...baseFields,
    effectiveFrom: dateOnly,
    effectiveTo: dateOnly.nullable().optional(),
    data: z
      .object({
        departmentId: id.nullable().optional(),
        establishmentId: id.nullable().optional(),
        scheduleType: z.enum(['FIXED', 'VARIABLE', 'SHIFT']),
        weeklyMinutes: z.number().int().positive().max(10080),
        legalRuleVersionId: z.string().max(120).nullable().optional(),
        shifts: z
          .array(
            z.object({
              weekday: z.number().int().min(0).max(6),
              startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
              endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
              crossesMidnight: z.boolean().default(false),
              breakMinutes: z.number().int().nonnegative().default(0),
            }),
          )
          .max(50)
          .default([]),
      })
      .passthrough(),
  }),
  WORK_SHIFT: z.object({
    ...baseFields,
    parentId: id,
    data: z
      .object({
        weekday: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        crossesMidnight: z.boolean().default(false),
        breakMinutes: z.number().int().nonnegative().default(0),
      })
      .passthrough(),
  }),
  SCHEDULE_ASSIGNMENT: z.object({
    ...baseFields,
    relatedId: id,
    effectiveFrom: dateOnly,
    effectiveTo: dateOnly.nullable().optional(),
    data: z
      .object({
        targetType: z.enum(['DEPARTMENT', 'ESTABLISHMENT', 'EMPLOYEE']),
        targetId: id,
      })
      .passthrough(),
  }),
  DEPARTMENT_ASSIGNMENT: z.object({
    ...baseFields,
    employeeId: id,
    relatedId: id,
    effectiveFrom: dateOnly,
    effectiveTo: dateOnly.nullable().optional(),
    data: z
      .object({
        assignmentType: z.enum(['PRIMARY', 'SECONDARY']),
        jobPositionId: id.nullable().optional(),
        notes: z.string().max(500).optional(),
      })
      .passthrough()
      .default({ assignmentType: 'PRIMARY' }),
  }),
};

export const entityTypes = Object.keys(schemas) as OrganizationEntityType[];
export const parseOrganizationRecord = (type: OrganizationEntityType, input: unknown) =>
  schemas[type].parse(input) as OrganizationRecordInput;
export const organizationIdSchema = id;
export const createOrganizationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  parentId: id.optional(),
  relatedId: id.optional(),
});
export const organizationUpdateSchema = z
  .object({
    expectedVersion: z.coerce.number().int().positive(),
    code: code.optional(),
    name: name.optional(),
    parentId: id.nullable().optional(),
    effectiveFrom: dateOnly.nullable().optional(),
    effectiveTo: dateOnly.nullable().optional(),
    employeeId: id.nullable().optional(),
    relatedId: id.nullable().optional(),
    percentage: z.coerce.number().positive().max(100).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedVersion'), {
    message: 'At least one field is required.',
  });
export const organizationStatusSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
});
export const setDepartmentParentSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  parentId: id.nullable(),
});
export const costAllocationBatchSchema = z.object({
  allocations: z
    .array(
      z.object({
        costCenterId: id,
        percentage: z.coerce.number().positive().max(100),
      }),
    )
    .min(1)
    .max(50),
  employeeId: id,
  effectiveFrom: dateOnly,
  effectiveTo: dateOnly.nullable().optional(),
});
export type ParsedOrganizationInput = OrganizationRecordInput;
