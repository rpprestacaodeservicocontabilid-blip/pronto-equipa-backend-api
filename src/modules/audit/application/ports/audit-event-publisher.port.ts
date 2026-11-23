import { AuditDomainEvent } from '../../domain/events/audit-domain-event';
export interface AuditEventPublisherPort {
  publish(event: AuditDomainEvent): Promise<void>;
}
