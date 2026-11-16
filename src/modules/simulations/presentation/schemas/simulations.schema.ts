import { z } from 'zod';
const date = z.string().date();
const period = z
  .object({ startDate: date, endDate: date })
  .refine((v) => v.startDate <= v.endDate, { message: 'O início deve ser anterior ao fim.' });
const adjustment = z.object({
  employeeId: z.string().uuid().optional(),
  componentCode: z.string().regex(/^[A-Z0-9_:-]{2,80}$/),
  operation: z.enum(['SET', 'ADD', 'SUBTRACT', 'PERCENT_INCREASE', 'PERCENT_DECREASE']),
  value: z.string().regex(/^\d{1,12}\.\d{2}$/),
  effectiveFrom: date.optional(),
  effectiveTo: date.optional(),
});
export const configurationSchema = z.object({
  period,
  employeeIds: z.array(z.string().uuid()).max(500).optional(),
  departmentId: z.number().int().positive().optional(),
  jobCategory: z.string().trim().max(100).optional(),
  excludeEmployeeIds: z.array(z.string().uuid()).max(500).optional(),
  adjustments: z.array(adjustment).max(200).default([]),
  baselinePayrollRunId: z.string().uuid().nullable().optional(),
  assumptions: z.record(z.string(), z.unknown()).optional(),
});
export const createScenarioSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum([
    'INDIVIDUAL_PAYROLL',
    'BULK_PAYROLL',
    'SALARY_INCREASE',
    'CONTRACT_CHANGE',
    'NEW_HIRE',
    'PROMOTION',
    'ALLOWANCES',
    'OVERTIME',
    'ABSENCE',
    'LOAN_DEDUCTIONS',
    'EMPLOYER_COST',
    'BUDGET_FORECAST',
    'LEGAL_RULE_CHANGE',
    'RETROACTIVE_IMPACT',
    'CUSTOM',
  ]),
  configuration: configurationSchema,
});
export const updateScenarioSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    configuration: configurationSchema.optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .refine((v) => v.name !== undefined || v.configuration !== undefined, {
    message: 'Informe alterações para o cenário.',
  });
export const runScenarioSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(180),
  version: z.number().int().positive().optional(),
  employeeIds: z.array(z.string().uuid()).max(500).optional(),
  period: period.optional(),
});
export const scenarioListSchema = z.object({
  status: z.string().optional(),
  type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const runListSchema = z.object({
  scenarioId: z.string().uuid().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const compareSchema = z.object({
  baseRunId: z.string().uuid(),
  comparedRunId: z.string().uuid(),
});
export const comparePayrollSchema = z.object({
  runId: z.string().uuid(),
  payrollRunId: z.string().uuid(),
});
export const projectionSchema = z.object({
  months: z.number().int().min(1).max(36),
  monthlyChanges: z
    .array(
      z.object({
        month: z.number().int().min(1).max(36),
        salaryIncreasePct: z
          .string()
          .regex(/^\d{1,5}\.\d{2}$/)
          .optional(),
        headcountDelta: z.number().int().min(-500).max(500).optional(),
      }),
    )
    .max(36)
    .optional(),
});
export const proposalSchema = z.object({
  runId: z.string().uuid(),
  reason: z.string().trim().min(5).max(2000),
});
export const decisionSchema = z.object({ reason: z.string().trim().min(5).max(2000) });
export const exportSchema = z.object({ format: z.enum(['CSV', 'XLSX', 'PDF']).default('CSV') });
export const idSchema = z.string().uuid();
