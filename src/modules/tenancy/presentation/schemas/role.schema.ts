import { z } from 'zod';

/** Criação de papel da empresa (`POST /api/v1/company/roles`). */
export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(100),

  description: z.string().trim().max(500).nullish(),

  permissionNames: z.array(z.string().trim().min(1).max(150)).max(100).optional(),
});

export type CreateRoleDto = z.infer<typeof createRoleSchema>;

/** Actualização de papel (`PATCH /api/v1/company/roles/:id`). */
export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),

  description: z.string().trim().max(500).nullish(),
});

export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;

/** Definição de permissões (`PUT /api/v1/company/roles/:id/permissions`). */
export const setRolePermissionsSchema = z.object({
  permissionNames: z.array(z.string().trim().min(1).max(150)).max(100),
});

export type SetRolePermissionsDto = z.infer<typeof setRolePermissionsSchema>;
