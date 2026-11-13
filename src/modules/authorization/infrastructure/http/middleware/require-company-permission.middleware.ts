import { Request, Response, NextFunction } from "express";

import { TenantPermissionCheckerPort } from "../../../application/ports/tenant-permission-checker.port";

/**
 * Exige a permissão indicada NO ÂMBITO da empresa resolvida.
 *
 * Camadas verificadas, por esta ordem:
 *  1. identidade (`req.user`) — 401;
 *  2. contexto empresarial (`req.tenant`) — 403 uniforme;
 *  3. permissão do papel do membro nesta empresa — 403 uniforme.
 *
 * Ao contrário do `authorizationMiddleware` legado do módulo auth,
 * NÃO existe bypass para ADMIN/SUPER_ADMIN: o acesso depende das
 * permissões do papel exercido dentro da empresa.
 */
export const createRequireCompanyPermission = (
    checker: TenantPermissionCheckerPort,
) => {
    return (permission: string) => {
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

                const companyId = req.tenant?.companyId;

                if (!companyId) {
                    res.status(403).json({
                        success: false,
                        error: {
                            message: "Access denied.",
                            code: "FORBIDDEN",
                            statusCode: 403,
                            timestamp: new Date().toISOString(),
                        },
                    });

                    return;
                }

                const allowed = await checker.hasPermission(
                    userId,
                    companyId,
                    permission,
                );

                if (!allowed) {
                    res.status(403).json({
                        success: false,
                        error: {
                            message: "Access denied.",
                            code: "FORBIDDEN",
                            statusCode: 403,
                            timestamp: new Date().toISOString(),
                        },
                    });

                    return;
                }

                next();
            } catch (error) {
                next(error);
            }
        };
    };
};
