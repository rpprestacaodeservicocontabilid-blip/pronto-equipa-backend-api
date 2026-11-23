import { randomUUID } from 'crypto';
import { AuditServicePort, AuditEventInput } from '../../application/ports/audit-service.port';
import { createAuditAppendPort } from '../../../audit/audit.module';
import { auditRequestContext } from '../../../../shared/infrastructure/context/audit-request-context';
import { logger } from '../../../../config/logger';
/** Authentication evidence goes to the same protected ledger as business evidence. */
export class AuditService implements AuditServicePort {
  async record(input: AuditEventInput): Promise<void> {
    const context = auditRequestContext.getStore();
    try {
      await createAuditAppendPort().append({
        eventId: randomUUID(),
        eventType: input.action,
        sourceId: 'identity',
        module: 'identity',
        category: 'SECURITY',
        severity: /FAIL|DENIED|BLOCK|REVOK|PASSWORD/.test(input.action) ? 'HIGH' : 'MEDIUM',
        scope: 'PLATFORM',
        actor: input.userId
          ? { actorType: 'USER', actorId: String(input.userId) }
          : { actorType: 'EXTERNAL', actorId: 'anonymous' },
        action: input.action,
        resource: {
          resourceType: input.resource || 'USER',
          resourceId: input.resourceId || String(input.userId || 'anonymous'),
        },
        outcome: /FAIL|DENIED|BLOCK/.test(input.action) ? 'FAILURE' : 'SUCCESS',
        occurredAt: new Date().toISOString(),
        correlationId: context?.requestId,
        requestId: context?.requestId,
        metadata: { ...input.metadata, ipAddress: input.ipAddress, userAgent: input.userAgent },
      });
    } catch {
      logger.error('[audit] identity evidence persistence failed', { action: input.action });
    }
  }
}
