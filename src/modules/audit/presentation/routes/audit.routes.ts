import { Router, Request, Response, NextFunction } from "express";

import { AuditLogController } from "../controllers/audit-log.controller";
import { queryAuditLogsSchema } from "../schemas/audit-log.schema";

type Middleware = (
    req: Request,
    res: Response,
    next: NextFunction,
) => void;

/**
 * Rotas do trilho de auditoria.
 *
 * Todas exigem `req.tenant` (resolvido pelos middlewares de tenant)
 * e a permissão `audit.read` no âmbito da empresa.
 */
export const createAuditRoutes = (
    controller: AuditLogController,
    requirePermission: Middleware,
): Router => {
    const router = Router();

    /**
     * @swagger
     * /company/audit-logs:
     *   get:
     *     summary: Consultar trilho de auditoria da empresa
     *     description: Lista paginada dos registos de auditoria do tenant autenticado.
     *     tags: [Audit]
     *     parameters:
     *       - in: query
     *         name: page
     *         schema: { type: integer, minimum: 1, default: 1 }
     *       - in: query
     *         name: limit
     *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
     *       - in: query
     *         name: action
     *         schema: { type: string }
     *       - in: query
     *         name: entityType
     *         schema: { type: string }
     *       - in: query
     *         name: entityId
     *         schema: { type: string }
     *       - in: query
     *         name: from
     *         schema: { type: string, format: date-time }
     *       - in: query
     *         name: to
     *         schema: { type: string, format: date-time }
     *     responses:
     *       200:
     *         description: Lista de registos de auditoria
     *       400:
     *         description: Contexto de empresa em falta ou filtros inválidos
     *       401:
     *         description: Não autenticado
     *       403:
     *         description: Sem permissão audit.read
     */
    router.get(
        "/audit-logs",
        requirePermission,
        (req, res, next) => {
            try {
                const parsed = queryAuditLogsSchema.parse(req.query);
                req.query = parsed as unknown as Request["query"];
                next();
            } catch (error) {
                next(error);
            }
        },
        (req, res) => controller.list(req, res),
    );

    return router;
};
