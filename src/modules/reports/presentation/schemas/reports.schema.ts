import { z } from 'zod';
export const reportFiltersSchema = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    employeeId: z.string().uuid().optional(),
    departmentId: z.coerce.number().int().positive().optional(),
    status: z.string().trim().max(30).optional(),
    limit: z.coerce.number().int().min(1).max(5000).optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'from must be before to' });
export const executeReportSchema = z.object({
  code: z.string().regex(/^RPT-[A-Z]+-\d{3}$/),
  filters: reportFiltersSchema.default({}),
});
export const exportReportSchema = executeReportSchema.extend({
  format: z.enum(['CSV', 'XLSX', 'PDF']).default('CSV'),
});
export const customReportSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().regex(/^RPT-[A-Z]+-\d{3}$/),
  fields: z.array(z.string().trim().min(1).max(60)).min(1).max(40),
  filters: reportFiltersSchema.optional(),
});
export const scheduleSchema = z.object({
  code: z.string().regex(/^RPT-[A-Z]+-\d{3}$/),
  cron: z.string().trim().min(9).max(100),
  timezone: z.string().trim().min(3).max(80),
  format: z.enum(['CSV', 'XLSX', 'PDF']).default('CSV'),
  filters: reportFiltersSchema.optional(),
  recipients: z.array(z.number().int().positive()).max(50).optional(),
});
export const idSchema = z.string().uuid();
