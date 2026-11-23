export const auditDomainEventTypes = [
  'audit.record.persisted',
  'audit.ingestion.failed',
  'audit.ingestion.recovered',
  'audit.integrity.verification-started',
  'audit.integrity.verified',
  'audit.integrity.violation-detected',
  'audit.investigation.opened',
  'audit.investigation.closed',
  'audit.evidence.package-created',
  'audit.evidence.package-verified',
  'audit.export.requested',
  'audit.export.approved',
  'audit.export.rejected',
  'audit.export.completed',
  'audit.retention.executed',
  'audit.legal-hold.created',
  'audit.legal-hold.released',
  'audit.alert.created',
  'audit.reconciliation.completed',
  'audit.reconciliation.failed',
] as const;
export type AuditDomainEventType = (typeof auditDomainEventTypes)[number];
export interface AuditDomainEvent {
  id: string;
  type: AuditDomainEventType;
  schemaVersion: 1;
  scopeKey: string;
  companyId: number | null;
  occurredAt: string;
  payload: Record<string, unknown>;
}
