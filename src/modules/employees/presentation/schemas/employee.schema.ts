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

export const employeeIdSchema = z.string().uuid();

export const createEmployeeSchema = z.object({
  employeeNumber: z.string().trim().min(1).max(50),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: dateOnly.optional().nullable(),
  nationality: z.string().trim().max(80).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  admissionDate: dateOnly,
  departmentId: z.coerce.number().int().positive().optional().nullable(),
  jobTitle: z.string().trim().max(150).optional().nullable(),
  jobCategory: z.string().trim().max(100).optional().nullable(),
});

export const updateEmployeeSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });

export const updateEmployeePersonalInfoSchema = z
  .object({
    dateOfBirth: dateOnly.nullable().optional(),
    nationality: z.string().trim().max(80).nullable().optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });

export const listEmployeesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ON_LEAVE', 'TERMINATED']).optional(),
  search: z.string().trim().max(100).optional(),
});

export const changeEmployeeStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ON_LEAVE', 'TERMINATED']),
  effectiveAt: dateOnly,
  reason: z.string().trim().min(1).max(500),
  terminationReason: z.string().trim().min(1).max(500).optional(),
});

export const terminateEmployeeSchema = z.object({
  effectiveAt: dateOnly,
  reason: z.string().trim().min(1).max(500),
  terminationReason: z.string().trim().min(1).max(500),
});

export const rehireEmployeeSchema = z.object({
  effectiveAt: dateOnly,
  reason: z.string().trim().min(1).max(500),
});

export const transferEmployeeSchema = z.object({
  departmentId: z.coerce.number().int().positive().nullable(),
  jobTitle: z.string().trim().max(150).nullable(),
  jobCategory: z.string().trim().max(100).nullable(),
  effectiveFrom: dateOnly,
  reason: z.string().trim().min(1).max(500),
});

export const addEmployeeDependentSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  relationship: z.string().trim().min(1).max(80),
  dateOfBirth: dateOnly.nullable().optional(),
  fiscalDependent: z.boolean().default(false),
});

export const employeeBankAccountSchema = z.object({
  bankName: z.string().trim().min(1).max(120),
  accountName: z.string().trim().min(1).max(150),
  accountNumber: z.string().trim().min(1).max(50),
  iban: z.string().trim().max(40).nullable().optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .default('AOA'),
});

export const importEmployeesSchema = z.object({
  employees: z.array(createEmployeeSchema).min(1).max(500),
});

export const exportEmployeesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ON_LEAVE', 'TERMINATED']).optional(),
  search: z.string().trim().max(100).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

export type CreateEmployeeDto = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeDto = z.infer<typeof updateEmployeeSchema>;
export type UpdateEmployeePersonalInfoDto = z.infer<typeof updateEmployeePersonalInfoSchema>;
export type ListEmployeesDto = z.infer<typeof listEmployeesSchema>;
export type ChangeEmployeeStatusDto = z.infer<typeof changeEmployeeStatusSchema>;
export type TransferEmployeeDto = z.infer<typeof transferEmployeeSchema>;
export type AddEmployeeDependentDto = z.infer<typeof addEmployeeDependentSchema>;
export type EmployeeBankAccountDto = z.infer<typeof employeeBankAccountSchema>;
export type ImportEmployeesDto = z.infer<typeof importEmployeesSchema>;
export type ExportEmployeesDto = z.infer<typeof exportEmployeesSchema>;
