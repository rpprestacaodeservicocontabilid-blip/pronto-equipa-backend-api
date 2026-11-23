import { AuditObject } from '../../domain/audit-contracts';
import {
  AuditAccess,
  AuditCategory,
  auditFailure,
  auditText,
  auditStrings,
} from '../../domain/audit-contracts';
import { AuditCore } from './audit-core';
import { AuditEvidenceService } from './audit-evidence.service';
import { AuditIntegrityService } from './audit-integrity.service';
import { AuditRetentionPolicy } from '../../domain/aggregates/audit-retention-policy';
import { AuditLegalHold } from '../../domain/aggregates/audit-legal-hold';
export class AuditRetentionService {
  constructor(
    private readonly core: AuditCore,
    private readonly evidence: AuditEvidenceService,
    private readonly integrity: AuditIntegrityService,
  ) {}
  async policy(
    access: AuditAccess,
    input: {
      category: AuditCategory;
      days: number;
      legalReference: string;
      reason: string;
      automatic?: boolean;
    },
  ): Promise<AuditObject> {
    input = AuditRetentionPolicy.normalize({ ...input });
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
  ): Promise<AuditObject> {
    input = AuditLegalHold.configuration(input);
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
  release(access: AuditAccess, id: string, reason: string): Promise<AuditObject> {
    return this.core.repository.transaction(access, async (tx) => {
      const row = await this.core.requireObject(access, 'LEGAL_HOLD', id, tx);
      const updated = await this.core.repository.updateObject(
        row,
        {
          status: 'RELEASED',
          data: new AuditLegalHold(row).release(
            access.actorId,
            reason,
            this.core.clock.now().toISOString(),
          ),
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
  async execute(access: AuditAccess, policyId: string): Promise<AuditObject> {
    const policy = await this.core.objectData(access, 'RETENTION', policyId);
    const domainPolicy = new AuditRetentionPolicy(policy);
    const cutoff = domainPolicy.cutoff(this.core.clock.now());
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
    const leaseToken = this.core.clock.id();
    const run = await this.core.repository.transaction(access, async (tx) => {
      const current = (await this.core.repository.objects(access, 'RETENTION_RUN', tx)).find(
        (row) => row.key === key,
      );
      if (current?.status === 'COMPLETED') return current;
      if (
        current?.status === 'RUNNING' &&
        Number(current.data.leaseUntil) > this.core.clock.now().getTime()
      )
        throw auditFailure('Retention execution already running.', 409);
      const data = {
        ...current?.data,
        policyId,
        cutoff: cutoff.toISOString(),
        leaseToken,
        leaseUntil: this.core.clock.now().getTime() + 600000,
      };
      return current
        ? this.core.repository.updateObject(current, { status: 'RUNNING', data }, tx)
        : this.core.createObject(access, 'RETENTION_RUN', key, 'RUNNING', data, tx);
    });
    if (run.status === 'COMPLETED') return run;
    let cursor = Number(run.data.cursor || 0),
      archived = Number(run.data.archived || 0),
      held = Number(run.data.held || 0);
    const packages: string[] = run.data.packages ? auditStrings(run.data.packages) : [];
    try {
      while (true) {
        const batch = await this.core.repository.transaction(access, async (tx) => {
          const rows = await this.core.repository.records(
            access,
            {
              category: policy.data.category as AuditCategory,
              to: cutoff.toISOString(),
              cursor,
              limit: 50,
            },
            tx,
          );
          const current = await this.core.requireObject(access, 'RETENTION_RUN', run.id, tx);
          if (current.data.leaseToken !== leaseToken)
            throw auditFailure('Retention lease changed.', 409);
          await this.core.repository.updateObject(
            current,
            { data: { ...current.data, leaseUntil: this.core.clock.now().getTime() + 600000 } },
            tx,
          );
          const holds = (await this.core.repository.objects(access, 'LEGAL_HOLD', tx)).filter(
            (h) => h.status === 'ACTIVE',
          );
          const investigations = (
            await this.core.repository.objects(access, 'INVESTIGATION', tx)
          ).filter((i) => i.status === 'OPEN');
          const records = rows.filter((record) =>
            domainPolicy.mayArchive(
              record,
              holds.map((hold) => new AuditLegalHold(hold)),
              investigations,
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
        await this.core.repository.transaction(access, async (tx) => {
          const current = await this.core.requireObject(access, 'RETENTION_RUN', run.id, tx);
          if (current.data.leaseToken !== leaseToken)
            throw auditFailure('Retention lease changed.', 409);
          await this.core.repository.updateObject(
            current,
            {
              data: {
                ...current.data,
                cursor,
                archived,
                held,
                packages,
                leaseUntil: this.core.clock.now().getTime() + 600000,
              },
            },
            tx,
          );
        });
      }
      return this.core.repository.transaction(access, async (tx) => {
        const current = await this.core.requireObject(access, 'RETENTION_RUN', run.id, tx);
        if (current.data.leaseToken !== leaseToken)
          throw auditFailure('Retention lease changed.', 409);
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
        if (current.data.leaseToken !== leaseToken) return;
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
