import { AuditRecorderPort, AuditRecordInput } from '../ports/audit-recorder.port';
import { AuditErrorReporterPort } from '../ports/audit-error-reporter.port';
import { AuditCore } from './audit-core';
import { AuditCategory } from '../../domain/audit-contracts';
export interface AuditOrigin {
  requestId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}
/** Compatibility for already committed operations. Critical writes use the transactional port or database capture. */
export class RecordModuleAuditUseCase implements AuditRecorderPort {
  constructor(
    private readonly core: AuditCore,
    private readonly legacy: AuditRecorderPort,
    private readonly reporter: AuditErrorReporterPort,
    private readonly origin: () => AuditOrigin,
  ) {}
  async record(input: AuditRecordInput): Promise<void> {
    const category: AuditCategory = /payroll|salary|payslip/.test(input.action)
      ? 'PAYROLL'
      : /payment|billing|subscription/.test(input.action)
        ? 'FINANCIAL'
        : /role|permission|member/.test(input.action)
          ? 'AUTHORIZATION'
          : /document/.test(input.action)
            ? 'DOCUMENT'
            : 'ACTIVITY';
    const source = this.origin();
    try {
      await this.core.append({
        eventId: this.core.clock.id(),
        eventType: input.action,
        category,
        severity: category === 'FINANCIAL' || category === 'PAYROLL' ? 'HIGH' : 'MEDIUM',
        scope: input.companyId === null ? 'PLATFORM' : 'TENANT',
        tenantId: input.companyId === null ? undefined : String(input.companyId),
        actor: input.actorUserId
          ? { actorType: 'USER', actorId: String(input.actorUserId) }
          : { actorType: 'SYSTEM', actorId: 'module' },
        action: input.action,
        resource: {
          resourceType: input.entityType,
          resourceId: String(input.entityId ?? 'collection'),
        },
        sourceId: 'application',
        outcome: 'SUCCESS',
        occurredAt: this.core.clock.now().toISOString(),
        correlationId: source.requestId,
        requestId: source.requestId,
        metadata: {
          before: input.before,
          after: input.after,
          ipAddress: input.ipAddress || source.ipAddress,
          userAgent: input.userAgent || source.userAgent,
        },
      });
    } catch {
      this.reporter.error('[audit] committed operation audit failed', {
        companyId: input.companyId,
        action: input.action,
      });
    }
    await this.legacy.record(input);
  }
}
