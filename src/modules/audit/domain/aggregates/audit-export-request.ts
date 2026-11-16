import { AuditObject, auditFailure, auditText } from '../audit-contracts';
export class AuditExportRequest {
  constructor(private readonly record: AuditObject) {
    if (record.kind !== 'EXPORT') throw auditFailure('Invalid export.');
  }
  decide(actor: number, approved: boolean, reason: string, at: string) {
    if (this.record.status !== 'PENDING_APPROVAL')
      throw auditFailure('Export already decided.', 409);
    if (this.record.data.requesterId === actor)
      throw auditFailure('Export approval requires another actor.', 403);
    return {
      ...this.record.data,
      approverId: actor,
      decision: approved ? 'APPROVED' : 'REJECTED',
      reason: auditText(reason, 'decision reason', 2000),
      decidedAt: at,
    };
  }
  assertDownload(actor: number) {
    if (this.record.status !== 'READY' || this.record.data.requesterId !== actor)
      throw auditFailure('Export unavailable.', 404);
  }
}
