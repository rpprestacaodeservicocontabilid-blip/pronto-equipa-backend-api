import { z } from 'zod';
import { createEmployeeSchema } from './employee.schema';

const text = (maximum: number, minimum = 0) => z.string().trim().min(minimum).max(maximum);
const day = z.iso.date();
const optional = (maximum: number) => text(maximum).optional();
const rows = <T extends z.ZodType>(schema: T) => z.object({ entries: z.array(schema).max(30) }).strict();

export const profileSchemas = {
  identification: rows(z.object({
    type: z.enum(['BI', 'PASSPORT', 'RESIDENCE_PERMIT', 'OTHER']),
    number: text(60, 1),
    issuedOn: day.optional(),
    expiresOn: day.optional(),
  }).strict().refine(row => !row.issuedOn || !row.expiresOn || row.expiresOn >= row.issuedOn,
    'Identification expiry must be on or after the issue date.')),
  address: z.object({
    country: optional(80), province: optional(100), municipality: optional(100), district: optional(100),
    neighbourhood: optional(100), streetAddress: optional(250), alternatePhone: optional(40),
    workEmail: z.email().max(255).optional(),
  }).strict(),
  tax: z.object({
    nif: z.string().trim().regex(/^[A-Za-z0-9-]{5,30}$/).optional(),
    socialSecurityNumber: z.string().trim().regex(/^[A-Za-z0-9-]{4,40}$/).optional(),
    taxResidence: optional(100), taxRegime: optional(100), contributionStatus: optional(100),
  }).strict(),
  emergency: rows(z.object({
    name: text(160, 1), relationship: text(80, 1), phone: text(40, 1), alternatePhone: optional(40),
  }).strict()),
  qualifications: rows(z.object({
    title: text(160, 1), institution: optional(160), kind: z.enum(['EDUCATION', 'TRAINING', 'CERTIFICATION']),
    completedOn: day.optional(), expiresOn: day.optional(),
  }).strict().refine(row => !row.completedOn || !row.expiresOn || row.expiresOn >= row.completedOn,
    'Expiry must be on or after completion.')),
};

export type ProfileSection = keyof typeof profileSchemas;
export const profileSection = z.enum(['identification', 'address', 'tax', 'emergency', 'qualifications']);
export const writeProfile = z.object({ version: z.number().int().min(0), content: z.unknown() }).strict();
export const registrationState = z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']);
export const registrationId = z.uuid();
export const draftPayload = createEmployeeSchema.partial().strict();
export const editDraft = z.object({ version: z.number().int().positive(), content: draftPayload }).strict();
export const decision = z.object({
  version: z.number().int().positive(),
  reason: text(500, 3).optional(),
}).strict();
export const registrationQuery = z.object({
  status: registrationState.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
