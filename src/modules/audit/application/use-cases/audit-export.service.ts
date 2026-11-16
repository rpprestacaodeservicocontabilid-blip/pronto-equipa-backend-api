import {
  AuditAccess,
  AuditQuery,
  auditFailure,
  auditStrings,
  auditText,
} from '../../domain/audit-contracts';
import { AuditExportRequest } from '../../domain/aggregates/audit-export-request';
import { AuditCore } from './audit-core';
import { AuditEvidenceService } from './audit-evidence.service';
export class AuditExportService {
  constructor(
    private readonly core: AuditCore,
    private readonly evidence: AuditEvidenceService,
  ) {}
  async request(access: AuditAccess, filter: AuditQuery) {
    this.core.purpose(access);
    this.core.validateQuery(filter);
    return this.core.repository.transaction(access, async (tx) => {
      const rows = await this.core.repository.records(
        access,
        { ...filter, limit: Math.min(filter.limit || 1000, 1000) },
        tx,
        access,
      );
      if (!rows.length) throw auditFailure('No records match the export criteria.', 422);
      const row = await this.core.createObject(
        access,
        'EXPORT',
        this.core.clock.id(),
        'PENDING_APPROVAL',
        {
          requesterId: access.actorId,
          purpose: access.purpose,
          recordIds: rows.map((r) => r.id),
          sensitive: rows.some((r) => r.sensitivity === 'SENSITIVE'),
          filter,
          requestedAt: this.core.clock.now().toISOString(),
        },
        tx,
      );
      await this.core.notice(
        access,
        access.actorId,
        'audit.export.requested',
        row.id,
        { records: rows.length, purpose: access.purpose },
        tx,
      );
      return row;
    });
  }
  async decide(access: AuditAccess, id: string, approved: boolean, reason: string) {
    return this.core.repository.transaction(access, async (tx) => {
      const row = await this.core.requireObject(access, 'EXPORT', id, tx);
      if (row.data.sensitive === true && !access.sensitive)
        throw auditFailure('Sensitive audit approval required.', 403);
      const data = new AuditExportRequest(row).decide(
        access.actorId,
        approved,
        reason,
        this.core.clock.now().toISOString(),
      );
      const updated = await this.core.repository.updateObject(
        row,
        { status: approved ? 'APPROVED' : 'REJECTED', data },
        tx,
      );
      await this.core.notice(
        access,
        access.actorId,
        approved ? 'audit.export.approved' : 'audit.export.rejected',
        id,
        { reason, purpose: access.purpose },
        tx,
      );
      return updated;
    });
  }
  async execute(access: AuditAccess, id: string) {
    const claimed = await this.core.repository.transaction(access, async (tx) => {
      const row = await this.core.requireObject(access, 'EXPORT', id, tx);
      if (row.status === 'READY') return row;
      if (
        row.status !== 'APPROVED' &&
        !(
          row.status === 'PROCESSING' &&
          Number(row.data.leaseUntil || 0) < this.core.clock.now().getTime()
        )
      )
        throw auditFailure('Export is not approved or is already running.', 409);
      if (row.data.sensitive === true && !access.sensitive)
        throw auditFailure('Sensitive export permission required.', 403);
      return this.core.repository.updateObject(
        row,
        {
          status: 'PROCESSING',
          data: { ...row.data, leaseUntil: this.core.clock.now().getTime() + 300000 },
        },
        tx,
      );
    });
    if (claimed.status === 'READY') return claimed;
    try {
      const ownerAccess = {
        ...access,
        actorId: Number(claimed.data.requesterId),
        purpose: auditText(claimed.data.purpose, 'purpose', 2000),
      };
      const pack = await this.evidence.create(ownerAccess, auditStrings(claimed.data.recordIds));
      return this.core.repository.transaction(access, async (tx) => {
        const row = await this.core.requireObject(access, 'EXPORT', id, tx);
        const updated = await this.core.repository.updateObject(
          row,
          {
            status: 'READY',
            data: {
              ...row.data,
              evidenceId: pack.id,
              completedAt: this.core.clock.now().toISOString(),
              leaseUntil: 0,
            },
          },
          tx,
        );
        await this.core.notice(
          access,
          access.actorId,
          'audit.export.completed',
          id,
          { evidenceId: pack.id },
          tx,
        );
        return updated;
      });
    } catch (error) {
      await this.core.repository.transaction(access, async (tx) => {
        const row = await this.core.requireObject(access, 'EXPORT', id, tx);
        await this.core.repository.updateObject(
          row,
          {
            status: 'APPROVED',
            data: {
              ...row.data,
              errorType: error instanceof Error ? error.name : 'Unknown',
              leaseUntil: 0,
            },
          },
          tx,
        );
      });
      throw error;
    }
  }
  async download(access: AuditAccess, id: string) {
    const row = await this.core.objectData(access, 'EXPORT', id);
    new AuditExportRequest(row).assertDownload(access.actorId);
    const bytes = await this.evidence.download(
      access,
      auditText(row.data.evidenceId, 'evidence id'),
    );
    await this.core.notice(access, access.actorId, 'audit.export.downloaded', id, {
      purpose: access.purpose,
    });
    return bytes;
  }
}
