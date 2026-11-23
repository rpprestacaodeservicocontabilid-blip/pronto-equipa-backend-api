import {
  AuditScope,
  AuditObject,
  auditData,
  auditFailure,
  auditText,
} from '../../domain/audit-contracts';
import {
  AuditDomainEvent,
  AuditDomainEventType,
  auditDomainEventTypes,
} from '../../domain/events/audit-domain-event';
import { AuditEventPublisherPort } from '../ports/audit-event-publisher.port';
import { AuditCore } from './audit-core';
export class AuditEventDeliveryService {
  constructor(
    private readonly core: AuditCore,
    private readonly publisher: AuditEventPublisherPort,
  ) {}
  private envelope(row: AuditObject): AuditDomainEvent {
    const type = auditText(row.data.eventType, 'outbox event type') as AuditDomainEventType;
    if (!auditDomainEventTypes.includes(type)) throw auditFailure('Unknown audit domain event.');
    const payload = row.data.payload
      ? auditData(row.data.payload)
      : { recordId: row.data.recordId, recordHash: row.data.recordHash };
    return {
      id: row.id,
      type,
      schemaVersion: 1,
      scopeKey: row.scopeKey,
      companyId: row.companyId,
      occurredAt: row.createdAt,
      payload,
    };
  }
  async drain(scope: AuditScope): Promise<{ published: number; failed: number }> {
    let published = 0,
      failed = 0;
    const rows = await this.core.list(scope, 'OUTBOX', {
      status: ['PENDING', 'RETRY', 'DELIVERING'],
      limit: 200,
    });
    for (const candidate of rows) {
      const lease = this.core.clock.id();
      const claimed = await this.core.repository.transaction(scope, async (tx) => {
        const row = await this.core.requireObject(scope, 'OUTBOX', candidate.id, tx);
        if (
          !['PENDING', 'RETRY', 'DELIVERING'].includes(row.status) ||
          Number(row.data.nextAttemptAt || 0) > this.core.clock.now().getTime() ||
          (row.status === 'DELIVERING' &&
            Number(row.data.leaseUntil) > this.core.clock.now().getTime())
        )
          return null;
        return this.core.repository.updateObject(
          row,
          {
            status: 'DELIVERING',
            data: { ...row.data, lease, leaseUntil: this.core.clock.now().getTime() + 60000 },
          },
          tx,
        );
      });
      if (!claimed) continue;
      try {
        await this.publisher.publish(this.envelope(claimed));
        await this.core.repository.transaction(scope, async (tx) => {
          const current = await this.core.requireObject(scope, 'OUTBOX', claimed.id, tx);
          if (current.data.lease !== lease) return;
          await this.core.repository.updateObject(
            current,
            {
              status: 'PUBLISHED',
              data: {
                ...current.data,
                publishedAt: this.core.clock.now().toISOString(),
                leaseUntil: 0,
              },
            },
            tx,
          );
        });
        published++;
      } catch (error) {
        failed++;
        await this.core.repository.transaction(scope, async (tx) => {
          const current = await this.core.requireObject(scope, 'OUTBOX', claimed.id, tx);
          if (current.data.lease !== lease) return;
          const attempts = Number(current.data.attempts || 0) + 1;
          await this.core.repository.updateObject(
            current,
            {
              status: attempts >= 8 ? 'DEAD' : 'RETRY',
              data: {
                ...current.data,
                attempts,
                leaseUntil: 0,
                nextAttemptAt:
                  this.core.clock.now().getTime() + Math.min(3600000, 10000 * 2 ** attempts),
                errorType: error instanceof Error ? error.name : 'Unknown',
              },
            },
            tx,
          );
          if (attempts === 8 && current.data.eventType !== 'audit.alert.created')
            await this.core.createObject(
              scope,
              'ALERT',
              `outbox:${current.id}`,
              'OPEN',
              { severity: 'CRITICAL', type: 'OUTBOX_DELIVERY_FAILED', outboxId: current.id },
              tx,
            );
        });
      }
    }
    return { published, failed };
  }
}
