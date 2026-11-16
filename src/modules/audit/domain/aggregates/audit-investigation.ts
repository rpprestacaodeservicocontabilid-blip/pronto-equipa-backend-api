import { AuditObject, auditFailure, auditStrings, auditText } from '../audit-contracts';
export class AuditInvestigation {
  constructor(private readonly record: AuditObject) {
    if (record.kind !== 'INVESTIGATION') throw auditFailure('Invalid investigation.');
  }
  addEvidence(ids: string[]) {
    if (this.record.status !== 'OPEN') throw auditFailure('Investigation is closed.', 409);
    return {
      ...this.record.data,
      recordIds: [...new Set([...auditStrings(this.record.data.recordIds), ...ids])],
    };
  }
  close(actor: number, reason: string, at: string) {
    if (this.record.status !== 'OPEN') throw auditFailure('Investigation is closed.', 409);
    return {
      ...this.record.data,
      closedBy: actor,
      closedAt: at,
      resolution: auditText(reason, 'resolution', 2000),
    };
  }
}
