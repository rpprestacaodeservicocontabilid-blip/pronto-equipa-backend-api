import { AuditLog } from "../../domain/entities/audit-log";
import { AuditLogRepository } from "../../domain/repositories/audit-log.repository";
import {
    AuditRecorderPort,
    AuditRecordInput,
} from "../ports/audit-recorder.port";
import { logger } from "../../../../config/logger";

/**
 * Grava eventos de auditoria (implementação do `AuditRecorderPort`).
 *
 * Best-effort por desenho: uma falha de auditoria é registada no
 * log estruturado mas nunca propaga — a operação de negócio que
 * originou o evento já está confirmada.
 */
export class RecordAuditLogUseCase implements AuditRecorderPort {
    constructor(
        private readonly repository: AuditLogRepository,
    ) { }

    async record(input: AuditRecordInput): Promise<void> {
        try {
            await this.repository.save(AuditLog.create(input));
        } catch (error) {
            logger.error(
                "[Audit] Falha ao gravar registo de auditoria:",
                {
                    action: input.action,
                    entityType: input.entityType,
                    companyId: input.companyId,
                    err: error,
                },
            );
        }
    }
}
