import { AuditLog } from '../../domain/entities/audit-log';
import { AuditLogRepository } from '../../domain/repositories/audit-log.repository';
import { AuditRecorderPort, AuditRecordInput } from '../ports/audit-recorder.port';
import { AuditErrorReporterPort } from '../ports/audit-error-reporter.port';

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
    private readonly reporter: AuditErrorReporterPort,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    try {
      await this.repository.save(AuditLog.create(input));
    } catch (error) {
      this.reporter.error('[Audit] Falha ao gravar registo de auditoria:', {
        action: input.action,
        entityType: input.entityType,
        companyId: input.companyId,
        errorType: error instanceof Error ? error.name : 'Unknown',
      });
    }
  }
}
