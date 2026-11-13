import { Router } from "express";

import { AuditRecorderPort } from "../../application/ports/audit-recorder.port";
import { RecordAuditLogUseCase } from "../../application/use-cases/record-audit-log.use-case";
import { QueryAuditLogsUseCase } from "../../application/use-cases/query-audit-logs.use-case";
import { SequelizeAuditLogRepository } from "../persistence/repositories/sequelize-audit-log.repository";
import { AuditLogController } from "../../presentation/controllers/audit-log.controller";
import { createAuditRoutes as buildAuditRoutes } from "../../presentation/routes/audit.routes";

type Middleware = (
    req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
) => void;

interface CreateAuditRoutesOptions {
    /** Verificador contextual de permissão no âmbito da empresa. */
    requirePermission: Middleware;
}

/**
 * Cria o gravador de auditoria partilhado por todos os módulos.
 *
 * Best-effort: `record` nunca lança (falhas são apenas loggadas).
 */
export function createAuditRecorder(): AuditRecorderPort {
    return new RecordAuditLogUseCase(
        new SequelizeAuditLogRepository(),
    );
}

/**
 * Monta as rotas do módulo audit (requer tenant + permissão).
 */
export function createAuditRoutes(
    options: CreateAuditRoutesOptions,
): Router {
    const repository = new SequelizeAuditLogRepository();

    const controller = new AuditLogController(
        new QueryAuditLogsUseCase(repository),
    );

    return buildAuditRoutes(
        controller,
        options.requirePermission,
    );
}
