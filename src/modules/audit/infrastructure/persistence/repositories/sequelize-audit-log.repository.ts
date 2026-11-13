import { Op, WhereOptions, WhereAttributeHashValue } from "sequelize";

import { AuditLog } from "../../../domain/entities/audit-log";
import {
    AuditLogRepository,
    ListAuditLogsParams,
    PaginatedAuditLogs,
} from "../../../domain/repositories/audit-log.repository";
import { AuditLogModel } from "../model/audit-log.model";

/**
 * Implementação Sequelize do repositório de auditoria.
 *
 * `companyId` é obrigatório em todas as consultas — o âmbito de
 * empresa nunca é inferido nem omitido.
 */
export class SequelizeAuditLogRepository
    implements AuditLogRepository {
    async save(log: AuditLog): Promise<AuditLog> {
        const data = log.toPrimitives();

        const model = await AuditLogModel.create({
            companyId: data.companyId,
            actorUserId: data.actorUserId,
            action: data.action,
            entityType: data.entityType,
            entityId: data.entityId,
            before: data.before,
            after: data.after,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            createdAt: data.createdAt,
        });

        return AuditLog.reconstitute({
            id: model.id,
            companyId: model.companyId,
            actorUserId: model.actorUserId,
            action: model.action,
            entityType: model.entityType,
            entityId: model.entityId,
            before: model.before,
            after: model.after,
            ipAddress: model.ipAddress,
            userAgent: model.userAgent,
            createdAt: model.createdAt,
        });
    }

    async list(
        params: ListAuditLogsParams,
    ): Promise<PaginatedAuditLogs> {
        const where: WhereOptions<AuditLogModel> = {
            companyId: params.companyId,
        };

        if (params.action) {
            where.action = params.action;
        }

        if (params.entityType) {
            where.entityType = params.entityType;
        }

        if (params.entityId) {
            where.entityId = params.entityId;
        }

        if (params.from || params.to) {
            const range: Record<symbol, Date> = {};

            if (params.from) {
                range[Op.gte] = params.from;
            }

            if (params.to) {
                range[Op.lte] = params.to;
            }

            where.createdAt =
                range as WhereAttributeHashValue<Date>;
        }

        const offset = (params.page - 1) * params.limit;

        const { rows, count } = await AuditLogModel.findAndCountAll({
            where,
            order: [["createdAt", "DESC"], ["id", "DESC"]],
            limit: params.limit,
            offset,
        });

        return {
            rows: rows.map((model) =>
                AuditLog.reconstitute({
                    id: model.id,
                    companyId: model.companyId,
                    actorUserId: model.actorUserId,
                    action: model.action,
                    entityType: model.entityType,
                    entityId: model.entityId,
                    before: model.before,
                    after: model.after,
                    ipAddress: model.ipAddress,
                    userAgent: model.userAgent,
                    createdAt: model.createdAt,
                }),
            ),
            total: count,
        };
    }
}
