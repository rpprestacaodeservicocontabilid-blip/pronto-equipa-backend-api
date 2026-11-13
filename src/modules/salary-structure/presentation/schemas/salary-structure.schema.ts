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
const id = z.string().uuid();
const currency = z
  .string()
  .length(3)
  .transform((value) => value.toUpperCase());
const componentTypes = z.enum([
  'BASE_SALARY',
  'ALLOWANCE',
  'BONUS',
  'COMMISSION',
  'BENEFIT',
  'COMPLEMENT',
  'ONE_TIME',
]);
const calculationMethods = z.enum([
  'FIXED_AMOUNT',
  'PERCENTAGE',
  'VARIABLE_INPUT',
  'FORMULA',
  'CONDITIONAL',
  'ONE_TIME',
]);
const frequency = z.enum(['MONTHLY', 'WEEKLY', 'BIWEEKLY', 'ANNUAL', 'ONE_TIME']);

export const listQuerySchema = z.object({
  page,
  limit,
  status: z.string().trim().min(1).max(30).optional(),
  employeeId: id.optional(),
  code: z.string().trim().min(1).max(50).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});
export const createComponentSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).optional(),
  componentType: componentTypes,
  calculationMethod: calculationMethods,
  frequency,
  currency,
  legalClassificationRef: z.string().trim().min(1).max(120).optional(),
  effectiveFrom: dateOnly,
  calculationConfig: z.record(z.string(), z.unknown()).default({}),
});
export const updateComponentSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
export const createComponentVersionSchema = createComponentSchema.omit({
  code: true,
  name: true,
  description: true,
});
export const createTableSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  effectiveFrom: dateOnly,
});
export const createTableVersionSchema = z.object({ effectiveFrom: dateOnly });
export const createGradeSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  minAmount: amount,
  maxAmount: amount,
  currency,
  functionCode: z.string().trim().max(100).optional(),
  categoryCode: z.string().trim().max(100).optional(),
});
export const createStepSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  amount,
  currency,
});
export const createStructureSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  effectiveFrom: dateOnly,
  items: z
    .array(
      z.object({
        componentVersionId: id,
        amount: amount.optional(),
        percentage: z
          .string()
          .regex(/^(0|[1-9]\d{0,2})(\.\d{1,4})?$/)
          .optional(),
        calculationConfig: z.record(z.string(), z.unknown()).default({}),
        required: z.boolean().default(false),
      }),
    )
    .min(1),
});
export const createStructureVersionSchema = z.object({
  effectiveFrom: dateOnly,
  items: z
    .array(
      z.object({
        componentVersionId: id,
        amount: amount.optional(),
        percentage: z
          .string()
          .regex(/^(0|[1-9]\d{0,2})(\.\d{1,4})?$/)
          .optional(),
        calculationConfig: z.record(z.string(), z.unknown()).default({}),
        required: z.boolean().default(false),
      }),
    )
    .min(1),
});
export const createAssignmentSchema = z.object({
  employeeId: id,
  contractId: id,
  structureVersionId: id,
  effectiveFrom: dateOnly,
  baseSalary: amount,
  currency,
  components: z
    .array(
      z.object({
        componentVersionId: id,
        amount: amount.optional(),
        sourceReference: z.string().trim().min(1).max(200).optional(),
        calculationConfig: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .default([]),
});
export const createRevisionSchema = z.object({
  employeeId: id,
  previousAssignmentId: id,
  effectiveFrom: dateOnly,
  reason: z.string().trim().min(1).max(2000),
  proposedData: z.object({
    baseSalary: amount,
    currency,
    structureVersionId: id,
    components: z
      .array(
        z.object({
          componentVersionId: id,
          amount: amount.optional(),
          sourceReference: z.string().trim().min(1).max(200).optional(),
          calculationConfig: z.record(z.string(), z.unknown()).default({}),
        }),
      )
      .default([]),
  }),
});
export const structureDecisionSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']) });
export const revisionDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().max(2000).optional(),
});
export const applyRevisionSchema = z.object({ idempotencyKey: z.string().trim().min(1).max(200) });
export const createRevisionBatchSchema = z.object({
  code: z.string().trim().min(1).max(50),
  effectiveFrom: dateOnly,
  reason: z.string().trim().min(1).max(2000),
  idempotencyKey: z.string().trim().min(1).max(200),
  items: z
    .array(
      z.object({
        employeeId: id,
        baseSalary: amount,
        currency,
        structureVersionId: id,
        components: z
          .array(
            z.object({
              componentVersionId: id,
              amount: amount.optional(),
              sourceReference: z.string().trim().min(1).max(200).optional(),
              calculationConfig: z.record(z.string(), z.unknown()).default({}),
            }),
          )
          .default([]),
      }),
    )
    .min(1)
    .max(1000),
});
export const createPolicySchema = z.object({
  code: z.string().trim().min(1).max(50),
  effectiveFrom: dateOnly,
  rules: z.record(z.string(), z.unknown()),
});
export const simulationSchema = z.object({
  baseSalary: amount,
  currency,
  effectiveDate: dateOnly.optional(),
  components: z
    .array(
      z.object({
        componentVersionId: id,
        amount: amount.optional(),
        sourceReference: z.string().trim().min(1).max(200).optional(),
        calculationConfig: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .default([]),
  structureVersionId: id.optional(),
});
export const reportTypeSchema = z.enum(['components', 'structures', 'revisions']);
export const employeeDateQuerySchema = z.object({ effectiveDate: dateOnly.optional() });
export const salaryIdSchema = id;
export const exportSchema = z.object({
  report: z.enum(['components', 'structures', 'revisions']),
  format: z.enum(['CSV']),
  filters: z.record(z.string(), z.unknown()).default({}),
});

export type CreateComponentBody = z.infer<typeof createComponentSchema>;
export type CreateComponentVersionBody = z.infer<typeof createComponentVersionSchema>;
export type CreateTableBody = z.infer<typeof createTableSchema>;
export type CreateTableVersionBody = z.infer<typeof createTableVersionSchema>;
export type CreateGradeBody = z.infer<typeof createGradeSchema>;
export type CreateStepBody = z.infer<typeof createStepSchema>;
export type CreateStructureBody = z.infer<typeof createStructureSchema>;
export type CreateStructureVersionBody = z.infer<typeof createStructureVersionSchema>;
export type CreateAssignmentBody = z.infer<typeof createAssignmentSchema>;
export type CreateRevisionBody = z.infer<typeof createRevisionSchema>;
export type CreateRevisionBatchBody = z.infer<typeof createRevisionBatchSchema>;
export type CreatePolicyBody = z.infer<typeof createPolicySchema>;
export type SimulationBody = z.infer<typeof simulationSchema>;
