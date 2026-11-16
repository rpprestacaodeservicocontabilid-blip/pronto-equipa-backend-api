import { AuditObject } from '../../domain/audit-contracts';
import { AuditAccess, auditText, auditFailure } from '../../domain/audit-contracts';
import { AuditInvestigation } from '../../domain/aggregates/audit-investigation';
import { AuditCore } from './audit-core';
export class AuditInvestigationService {
  constructor(private readonly core: AuditCore) {}
  open(access: AuditAccess, title: string, reason: string): Promise<AuditObject> {
    this.core.purpose(access);
    return this.core.repository.transaction(access, async (tx) => {
      const row = await this.core.createObject(
        access,
        'INVESTIGATION',
        this.core.clock.id(),
        'OPEN',
        {
          title: auditText(title, 'title', 200),
          reason: auditText(reason, 'reason', 2000),
          openedBy: access.actorId,
          recordIds: [],
          events: [
            { type: 'OPENED', actorId: access.actorId, at: this.core.clock.now().toISOString() },
          ],
        },
        tx,
      );
      await this.core.notice(
        access,
        access.actorId,
        'audit.investigation.opened',
        row.id,
        { purpose: access.purpose },
        tx,
      );
      return row;
    });
  }
  addEvidence(access: AuditAccess, id: string, ids: string[]): Promise<AuditObject> {
    return this.core.repository.transaction(access, async (tx) => {
      const row = await this.core.requireObject(access, 'INVESTIGATION', id, tx);
      if (row.data.sensitive === true && !access.sensitive)
        throw auditFailure('Sensitive investigation permission required.', 403);
      const records = await this.core.accessibleRecords(access, ids, tx);
      const data = {
        ...new AuditInvestigation(row).addEvidence(ids),
        sensitive:
          row.data.sensitive === true || records.some((r) => r.sensitivity === 'SENSITIVE'),
      };
      const updated = await this.core.repository.updateObject(row, { data }, tx);
      await this.core.notice(
        access,
        access.actorId,
        'audit.investigation.evidence-added',
        id,
        { recordIds: ids, purpose: access.purpose },
        tx,
      );
      return updated;
    });
  }
  close(access: AuditAccess, id: string, reason: string): Promise<AuditObject> {
    return this.core.repository.transaction(access, async (tx) => {
      const row = await this.core.requireObject(access, 'INVESTIGATION', id, tx);
      if (row.data.sensitive === true && !access.sensitive)
        throw auditFailure('Sensitive investigation permission required.', 403);
      const data = new AuditInvestigation(row).close(
        access.actorId,
        reason,
        this.core.clock.now().toISOString(),
      );
      const updated = await this.core.repository.updateObject(row, { status: 'CLOSED', data }, tx);
      await this.core.notice(
        access,
        access.actorId,
        'audit.investigation.closed',
        id,
        { reason, purpose: access.purpose },
        tx,
      );
      return updated;
    });
  }
}
