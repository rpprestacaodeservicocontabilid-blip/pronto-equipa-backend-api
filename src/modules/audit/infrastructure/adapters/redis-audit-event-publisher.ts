import { createHash } from 'crypto';
import { RedisManager } from '../../../../infra/redis';
import { AuditEventPublisherPort } from '../../application/ports/audit-event-publisher.port';
import { AuditDomainEvent } from '../../domain/events/audit-domain-event';
import { canonicalAudit } from '../../domain/services/audit-data.service';
import { auditFailure } from '../../domain/audit-contracts';
const publishScript = `
local previous=redis.call('GET',KEYS[2])
if previous then
  if previous~=ARGV[1] then return redis.error_reply('Conflicting audit event replay') end
  return 0
end
local position=redis.call('XADD',KEYS[1],'*','eventId',ARGV[2],'eventType',ARGV[3],'scopeKey',ARGV[4],'body',ARGV[5])
redis.call('SET',KEYS[2],ARGV[1])
return position`;
/** The PostgreSQL outbox is authoritative; Redis Streams is a replayable delivery transport. */
export class RedisAuditEventPublisher implements AuditEventPublisherPort {
  async publish(event: AuditDomainEvent): Promise<void> {
    if (!RedisManager.isEnabled()) throw auditFailure('Audit event transport is unavailable.', 503);
    const prefix = process.env.AUDIT_EVENT_PREFIX || 'prontoequipas';
    if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(prefix))
      throw auditFailure('Invalid audit event prefix.', 503);
    const namespace = `${prefix}:{audit-events}`,
      body = canonicalAudit(event),
      digest = createHash('sha256').update(body).digest('hex');
    await RedisManager.client.eval(
      publishScript,
      2,
      `${namespace}:stream`,
      `${namespace}:published:${event.id}`,
      digest,
      event.id,
      event.type,
      event.scopeKey,
      body,
    );
  }
}
