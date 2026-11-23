export { createAuditRecorder, createAuditRoutes } from './infrastructure/bootstrap/audit.bootstrap';

export { createAuditModule } from './infrastructure/bootstrap/audit-engine.bootstrap';
export type {
  TransactionalAuditPort,
  AuditAppendPort,
} from './application/ports/audit-engine.ports';
export type { AuditEventInput, AuditReceipt } from './domain/audit-contracts';
export { auditRequestMiddleware } from './presentation/middlewares/audit-request.middleware';
export { createAuditAppendPort } from './infrastructure/bootstrap/audit-engine.bootstrap';
export { createAuditEventRecorder } from './infrastructure/bootstrap/audit-engine.bootstrap';
export type {
  AuditEventRecorderPort,
  AuditCanonicalRecordInput,
} from './application/ports/audit-event-recorder.port';
export type { AuditEventPublisherPort } from './application/ports/audit-event-publisher.port';
export type { AuditDomainEvent, AuditDomainEventType } from './domain/events/audit-domain-event';
