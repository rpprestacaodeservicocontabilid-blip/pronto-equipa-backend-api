import { z } from 'zod';
import {
  supportPriorities,
  supportStatuses,
  supportTicketTypes,
} from '../../domain/support-ticket';

export const supportTicketSchema = z
  .object({
    type: z.enum(supportTicketTypes),
    categoryCode: z.string().trim().min(2).max(80),
    subject: z.string().trim().min(3).max(200),
    description: z.string().trim().min(10).max(12000),
    affectedModule: z.string().trim().max(80).optional(),
    attachments: z.array(z.string().uuid()).max(10).optional(),
    idempotencyKey: z.string().trim().min(8).max(160),
    priority: z.enum(supportPriorities).optional(),
    audience: z.enum(['COMPANY', 'PLATFORM']).optional(),
  })
  .strict();
export const supportMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(12000),
    visibility: z.enum(['PUBLIC', 'INTERNAL']).default('PUBLIC'),
    attachmentIds: z.array(z.string().uuid()).max(10).optional(),
    idempotencyKey: z.string().trim().min(8).max(160),
  })
  .strict();
export const supportPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(supportStatuses).optional(),
  type: z.enum(supportTicketTypes).optional(),
  queue: z.enum(['active', 'pending', 'assigned', 'resolved']).optional(),
  priority: z.enum(supportPriorities).optional(),
});
export const supportUpdateTicketSchema = z
  .object({
    subject: z.string().trim().min(3).max(200).optional(),
    categoryCode: z.string().trim().min(2).max(80).optional(),
    affectedModule: z.string().trim().max(80).nullable().optional(),
  })
  .strict();
export const supportAssignmentSchema = z
  .object({
    agentId: z.number().int().positive().optional(),
    teamId: z.string().uuid().optional(),
    automatic: z.boolean().optional(),
  })
  .strict();
export const supportPolicySchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z0-9_-]{2,60}$/),
    firstResponseHours: z.number().positive().max(1000),
    resolutionHours: z.number().positive().max(5000),
    businessDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    holidays: z.array(z.string().date()).max(100).optional(),
    businessStartHour: z.number().int().min(0).max(23).optional(),
    businessEndHour: z.number().int().min(1).max(24).optional(),
    priorityResolutionHours: z
      .object({
        LOW: z.number().positive().max(5000).optional(),
        NORMAL: z.number().positive().max(5000).optional(),
        HIGH: z.number().positive().max(5000).optional(),
        CRITICAL: z.number().positive().max(5000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.businessStartHour === undefined ||
      value.businessEndHour === undefined ||
      value.businessStartHour < value.businessEndHour,
    'O fim do horário de atendimento deve ser posterior ao início.',
  );
export const supportResourceSchema = z.record(z.string(), z.unknown());
export const supportIncidentSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    severity: z.enum(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL']),
    affectedServices: z.array(z.string().trim().min(1).max(100)).min(1),
    description: z.string().trim().min(10).max(12000),
  })
  .strict();
export const supportIncidentPatchSchema = z
  .object({
    status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED']).optional(),
    message: z.string().max(4000).optional(),
    cause: z.string().max(4000).optional(),
    resolution: z.string().max(4000).optional(),
  })
  .strict();
export const supportArticleSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{3,120}$/),
    title: z.string().trim().min(3).max(200),
    content: z.string().trim().min(10).max(30000),
    visibility: z.enum(['PUBLIC', 'TENANT', 'INTERNAL']),
    category: z.string().max(80).optional(),
  })
  .strict();
export const supportArticlePatchSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    content: z.string().trim().min(10).max(30000).optional(),
    visibility: z.enum(['PUBLIC', 'TENANT', 'INTERNAL']).optional(),
    category: z.string().max(80).optional(),
  })
  .strict();
export const supportRatingSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(2000).optional(),
  })
  .strict();
export const supportTransitionSchema = z.object({
  resolution: z.string().trim().min(3).max(4000).optional(),
});
export const supportResolveSchema = z
  .object({
    resolution: z.string().trim().min(3).max(4000),
  })
  .strict();
export const supportPrioritySchema = z
  .object({
    priority: z.enum(supportPriorities),
  })
  .strict();
export const supportTransferSchema = z
  .object({
    teamId: z.string().uuid(),
  })
  .strict();
export const supportIncidentLinkSchema = z
  .object({
    incidentId: z.string().uuid(),
  })
  .strict();
export const supportEscalationSchema = z
  .object({
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();
export const supportInternalNoteSchema = supportMessageSchema.extend({
  visibility: z.literal('INTERNAL').default('INTERNAL'),
});
