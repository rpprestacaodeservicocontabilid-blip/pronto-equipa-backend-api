import { AuditObject, auditFailure, auditStrings, auditText } from '../audit-contracts';
export class AuditInvestigation {
  constructor(private readonly record: AuditObject) {
    if (record.kind !== 'INVESTIGATION') throw auditFailure('Invalid investigation.');
  }
  addEvidence(ids: string[], actor?: number, at?: string) {
    if (this.record.status !== 'OPEN') throw auditFailure('Investigation is closed.', 409);
    return {
      ...this.record.data,
      recordIds: [...new Set([...auditStrings(this.record.data.recordIds), ...ids])],
      events: [
        ...(Array.isArray(this.record.data.events) ? this.record.data.events : []),
        { type: 'EVIDENCE_ADDED', actorId: actor, at, recordIds: [...new Set(ids)] },
      ],
    };
  }
  close(actor: number, reason: string, at: string) {
    if (this.record.status !== 'OPEN') throw auditFailure('Investigation is closed.', 409);
    return {
      ...this.record.data,
      closedBy: actor,
      closedAt: at,
      resolution: auditText(reason, 'resolution', 2000),
      events: [
        ...(Array.isArray(this.record.data.events) ? this.record.data.events : []),
        { type: 'CLOSED', actorId: actor, at },
      ],
    };
  }
}
