import { z } from "zod";

/** Criação de empresa (`POST /api/v1/companies`). */
export const createCompanySchema = z.object({
    name: z.string().trim().min(2).max(150),

    slug: z
        .string()
        .trim()
        .min(2)
        .max(160)
        .regex(
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
            "Slug must contain only lowercase letters, numbers and single hyphens.",
        )
        .optional(),

    nif: z.string().trim().max(50).nullish(),

    email: z.string().trim().email().max(255).nullish(),

    phone: z.string().trim().max(30).nullish(),

    timezone: z.string().trim().min(1).max(60).optional(),

    locale: z.string().trim().min(2).max(10).optional(),
});

export type CreateCompanyDto = z.infer<typeof createCompanySchema>;

/** Actualização de perfil da empresa (`PATCH /api/v1/company`). */
export const updateCompanySchema = z
    .object({
        name: z.string().trim().min(2).max(150).optional(),

        nif: z.string().trim().max(50).nullish(),

        email: z.string().trim().email().max(255).nullish(),

        phone: z.string().trim().max(30).nullish(),

        timezone: z.string().trim().min(1).max(60).optional(),

        locale: z.string().trim().min(2).max(10).optional(),
    })
    .refine(
        (value) =>
            Object.values(value).some(
                (entry) => entry !== undefined,
            ),
        { message: "At least one field is required." },
    );

export type UpdateCompanyDto = z.infer<typeof updateCompanySchema>;

/** Listagem paginada (`GET /api/v1/platform/companies`). */
export const listCompaniesSchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),

    limit: z.coerce.number().int().min(1).max(100).optional().default(20),

    search: z.string().trim().min(1).max(150).optional(),
});

export type ListCompaniesDto = z.infer<typeof listCompaniesSchema>;
