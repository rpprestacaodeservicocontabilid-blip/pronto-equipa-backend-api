import { z } from "zod";

/** Listagem de membros (`GET /api/v1/company/membros`). */
export const listMembersSchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),

    limit: z.coerce.number().int().min(1).max(100).optional().default(20),

    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export type ListMembersDto = z.infer<typeof listMembersSchema>;

/** Adição de membro (`POST /api/v1/company/membros`). */
export const addMemberSchema = z.object({
    userId: z.coerce.number().int().positive(),

    roleId: z.coerce.number().int().positive(),
});

export type AddMemberDto = z.infer<typeof addMemberSchema>;

/** Alteração de membro (`PATCH /api/v1/company/membros/:id`). */
export const updateMemberSchema = z
    .object({
        roleId: z.coerce.number().int().positive().optional(),

        status: z.enum(["ACTIVE", "SUSPENDED", "REMOVED"]).optional(),
    })
    .refine(
        (value) => value.roleId !== undefined || value.status !== undefined,
        { message: "At least one field is required." },
    );

export type UpdateMemberDto = z.infer<typeof updateMemberSchema>;
