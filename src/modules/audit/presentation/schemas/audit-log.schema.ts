import { z } from 'zod';

/** Filtros de consulta do trilho de auditoria (query string). */
export const queryAuditLogsSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),

  limit: z.coerce.number().int().min(1).max(100).optional().default(20),

  action: z.string().trim().min(1).max(100).optional(),

  entityType: z.string().trim().min(1).max(100).optional(),

  entityId: z.string().trim().min(1).max(100).optional(),

  from: z.string().trim().min(1).optional(),

  to: z.string().trim().min(1).optional(),
});

export type QueryAuditLogsDto = z.infer<typeof queryAuditLogsSchema>;
