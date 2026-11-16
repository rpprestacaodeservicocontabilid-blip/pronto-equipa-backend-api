import { AuditRecordView, auditFailure, auditScope } from '../audit-contracts';
export function auditSeal(
  row: AuditRecordView,
): Omit<AuditRecordView, 'payloadHash' | 'recordHash' | 'previousHash'> {
  return {
    id: row.id,
    eventId: row.eventId,
    sourceId: row.sourceId,
    scopeKey: row.scopeKey,
    companyId: row.companyId,
    sequence: row.sequence,
    schemaVersion: row.schemaVersion,
    receivedAt: row.receivedAt,
    policyVersion: row.policyVersion,
    eventType: row.eventType,
    category: row.category,
    severity: row.severity,
    outcome: row.outcome,
    actorId: row.actorId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    correlationId: row.correlationId,
    sensitivity: row.sensitivity,
    occurredAt: row.occurredAt,
    inputHash: row.inputHash,
    payload: row.payload,
  };
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}
export class AuditRecord {
  private readonly state: AuditRecordView;
  constructor(input: AuditRecordView) {
    if (
      auditScope(input.companyId).scopeKey !== input.scopeKey ||
      !Number.isSafeInteger(input.sequence) ||
      input.sequence < 1 ||
      ![input.inputHash, input.payloadHash, input.recordHash, input.previousHash].every((hash) =>
        /^[a-f0-9]{64}$/.test(hash),
      )
    )
      throw auditFailure('Invalid audit record invariants.');
    this.state = structuredClone(input);
    freeze(this.state);
  }
  toPrimitives(): AuditRecordView {
    return structuredClone(this.state);
  }
}
