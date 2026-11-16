import {
  AuditAccess,
  AuditCategory,
  AuditRecordView,
  auditFailure,
  auditStrings,
  auditText,
} from '../../domain/audit-contracts';
import { AuditCore } from './audit-core';
import { AuditEvidenceService } from './audit-evidence.service';
import { AuditIntegrityService } from './audit-integrity.service';
export class AuditRetentionService {
  constructor(
    private readonly core: AuditCore,
    private readonly evidence: AuditEvidenceService,
    private readonly integrity: AuditIntegrityService,
  ) {}
  async policy(
    access: AuditAccess,
    input: { category: AuditCategory; days: number; legalReference: string; reason: string },
  ) {
    if (!Number.isSafeInteger(input.days) || input.days < 1)
      throw auditFailure('A positive retention period must be explicitly approved.');
    return this.core.repository.transaction(access, async (tx) => {
      const versions = (await this.core.repository.objects(access, 'RETENTION', tx)).filter(
        (p) => p.data.category === input.category,
      );
      const version = Math.max(0, ...versions.map((v) => Number(v.data.version))) + 1;
      const row = await this.core.createObject(
        access,
        'RETENTION',
        `${input.category}:${version}`,
        'ACTIVE',
        {
          ...input,
          mode: 'ARCHIVE',
          version,
          createdBy: access.actorId,
          legalReference: auditText(input.legalReference, 'retention authority', 1000),
          reason: auditText(input.reason, 'reason', 2000),
        },
        tx,
      );
      for (const previous of versions.filter((p) => p.status === 'ACTIVE'))
        await this.core.repository.updateObject(previous, { status: 'SUPERSEDED' }, tx);
      await this.core.notice(
        access,
        access.actorId,
        'audit.retention.policy-created',
        row.id,
        { category: input.category, days: input.days, version },
        tx,
      );
      return row;
    });
  }
  hold(
    access: AuditAccess,
    input: {
      reason: string;
      recordIds?: string[];
      resourceType?: string;
      resourceId?: string;
      wholeScope?: boolean;
    },
  ) {
    if (!input.wholeScope && !input.recordIds?.length && !input.resourceType)
      throw auditFailure('Specify records, a resource, or an explicit scope-wide legal hold.');
    return this.core.repository.transaction(access, async (tx) => {
      if (input.recordIds?.length) await this.core.accessibleRecords(access, input.recordIds, tx);
      const row = await this.core.createObject(
        access,
        'LEGAL_HOLD',
        this.core.clock.id(),
        'ACTIVE',
        {
          ...input,
          reason: auditText(input.reason, 'legal hold reason', 2000),
          createdBy: access.actorId,
        },
        tx,
      );
      await this.core.notice(
        access,
        access.actorId,
        'audit.legal-hold.created',
        row.id,
        { reason: input.reason },
        tx,
      );
      return row;
    });
  }
  release(access: AuditAccess, id: string, reason: string) {
    return this.core.repository.transaction(access, async (tx) => {
      const row = await this.core.requireObject(access, 'LEGAL_HOLD', id, tx);
      if (row.status !== 'ACTIVE') throw auditFailure('Legal hold is not active.', 409);
      const updated = await this.core.repository.updateObject(
        row,
        {
          status: 'RELEASED',
          data: {
            ...row.data,
            releasedBy: access.actorId,
            releasedAt: this.core.clock.now().toISOString(),
            releaseReason: auditText(reason, 'release reason', 2000),
          },
        },
        tx,
      );
      await this.core.notice(
        access,
        access.actorId,
        'audit.legal-hold.released',
        id,
        { reason },
        tx,
      );
      return updated;
    });
  }
  async execute(access: AuditAccess, policyId: string) {
    const policy = await this.core.objectData(access, 'RETENTION', policyId);
    if (policy.status !== 'ACTIVE') throw auditFailure('Retention policy is not active.', 409);
    const cutoff = new Date(this.core.clock.now().getTime() - Number(policy.data.days) * 86400000);
    if (Number.isNaN(cutoff.getTime())) throw auditFailure('Invalid retention cutoff.');
    const key = `${policyId}:${cutoff.toISOString().slice(0, 10)}`;
    const previous = (await this.core.list(access, 'RETENTION_RUN')).find((row) => row.key === key);
    if (previous?.status === 'COMPLETED') return previous;
    if (
      previous?.status === 'RUNNING' &&
      Number(previous.data.leaseUntil) > this.core.clock.now().getTime()
    )
      throw auditFailure('Retention execution already running.', 409);
    await this.integrity.checkpoint(access);
    const run = await this.core.repository.transaction(access, async (tx) =>
      previous
        ? this.core.repository.updateObject(
            previous,
            {
              status: 'RUNNING',
              data: { ...previous.data, leaseUntil: this.core.clock.now().getTime() + 600000 },
            },
            tx,
          )
        : this.core.createObject(
            access,
            'RETENTION_RUN',
            key,
            'RUNNING',
            {
              policyId,
              cutoff: cutoff.toISOString(),
              leaseUntil: this.core.clock.now().getTime() + 600000,
            },
            tx,
          ),
    );
    let cursor = 0,
      archived = 0,
      held = 0;
    const packages: string[] = [];
    try {
      while (true) {
        const batch = await this.core.repository.transaction(access, async (tx) => {
          const rows = await this.core.repository.records(
            access,
            {
              category: policy.data.category as AuditCategory,
              to: cutoff.toISOString(),
              cursor,
              limit: 1000,
            },
            tx,
          );
          const holds = (await this.core.repository.objects(access, 'LEGAL_HOLD', tx)).filter(
            (h) => h.status === 'ACTIVE',
          );
          const investigations = (
            await this.core.repository.objects(access, 'INVESTIGATION', tx)
          ).filter((i) => i.status === 'OPEN');
          const records = rows.filter(
            (record) =>
              !holds.some(
                (hold) =>
                  hold.data.wholeScope === true ||
                  (Array.isArray(hold.data.recordIds) && hold.data.recordIds.includes(record.id)) ||
                  (hold.data.resourceType === record.resourceType &&
                    (!hold.data.resourceId || hold.data.resourceId === record.resourceId)),
              ) &&
              !investigations.some(
                (i) => Array.isArray(i.data.recordIds) && i.data.recordIds.includes(record.id),
              ),
          );
          return { rows, records };
        });
        if (!batch.rows.length) break;
        held += batch.rows.length - batch.records.length;
        cursor = batch.rows[batch.rows.length - 1]!.sequence;
        if (batch.records.length) {
          const evidence = await this.evidence.create(
            access,
            batch.records.map((r) => r.id),
          );
          packages.push(evidence.id);
          archived += batch.records.length;
        }
      }
      return this.core.repository.transaction(access, async (tx) => {
        const current = await this.core.requireObject(access, 'RETENTION_RUN', run.id, tx);
        const result = await this.core.repository.updateObject(
          current,
          {
            status: 'COMPLETED',
            data: {
              ...current.data,
              archived,
              held,
              packages,
              deleted: 0,
              mode: 'ARCHIVE',
              completedAt: this.core.clock.now().toISOString(),
              leaseUntil: 0,
            },
          },
          tx,
        );
        await this.core.notice(
          access,
          access.actorId,
          'audit.retention.executed',
          run.id,
          { archived, held, packages, purpose: access.purpose },
          tx,
        );
        return result;
      });
    } catch (error) {
      await this.core.repository.transaction(access, async (tx) => {
        const current = await this.core.requireObject(access, 'RETENTION_RUN', run.id, tx);
        await this.core.repository.updateObject(
          current,
          {
            status: 'FAILED',
            data: {
              ...current.data,
              packages,
              archived,
              held,
              leaseUntil: 0,
              errorType: error instanceof Error ? error.name : 'Unknown',
            },
          },
          tx,
        );
      });
      throw error;
    }
  }
}
