import { Request, Response, NextFunction } from "express";

import { MembershipReaderPort } from "../../../../tenancy/application/ports/membership-reader.port";

/** Mensagem única para qualquer falha de contexto — anti-enumeration. */
const TENANT_DENIED = "Access denied.";

/**
 * Middleware de resolução do contexto de tenant (empresa).
 *
 * Fonte do `companyId`:
 *  1. header `X-Company-Id` (preferido para APIs de cliente);
 *  2. query string `companyId` (fallback para downloads/links).
 *
 * Regras, todas falham com a MESMA resposta 403 (não revela se a
 * empresa existe, se o utilizador é membro ou o estado dela):
 *
 *  - utilizador autenticado;
 *  - companyId presente e numérico;
 *  - vínculo membro ↔ empresa existe;
 *  - membro ACTIVO;
 *  - empresa ACTIVA.
 *
 * Em caso de sucesso popula `req.tenant = { companyId }`.
 */
export const createTenantContextMiddleware = (
    membershipReader: MembershipReaderPort,
) => {
    return async (
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> => {
        try {
            const userId = req.user?.userId;

            if (!userId) {
                res.status(401).json({
                    message: "Authentication required.",
                });

                return;
            }

            const raw =
                (req.get("x-company-id") as string | undefined) ??
                (typeof req.query.companyId === "string"
                    ? req.query.companyId
                    : undefined);

            const companyId = Number(raw);

            if (!raw || !Number.isInteger(companyId) || companyId <= 0) {
                res.status(403).json({
                    success: false,
                    error: {
                        message: TENANT_DENIED,
                        code: "FORBIDDEN",
                        statusCode: 403,
                        timestamp: new Date().toISOString(),
                    },
                });

                return;
            }

            const membership = await membershipReader.findMembership(
                companyId,
                userId,
            );

            if (
                !membership ||
                membership.memberStatus !== "ACTIVE" ||
                membership.companyStatus !== "ACTIVE"
            ) {
                res.status(403).json({
                    success: false,
                    error: {
                        message: TENANT_DENIED,
                        code: "FORBIDDEN",
                        statusCode: 403,
                        timestamp: new Date().toISOString(),
                    },
                });

                return;
            }

            req.tenant = { companyId };

            next();
        } catch (error) {
            next(error);
        }
    };
};
