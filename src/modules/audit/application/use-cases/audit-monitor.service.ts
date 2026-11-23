import { AuditReceipt } from '../../domain/audit-contracts';
import { AuditObject } from '../../domain/audit-contracts';
import {
  AuditAccess,
  AuditEventInput,
  AuditScope,
  auditData,
  auditFailure,
  auditText,
} from '../../domain/audit-contracts';
import { normalizeAudit, canonicalAudit } from '../../domain/services/audit-data.service';
import { AuditCore } from './audit-core';
import { AuditEventSourcePort, AuditEvidenceStoragePort } from '../ports/audit-engine.ports';
import { AuditPolicy } from '../../domain/aggregates/audit-policy';
import { AuditAlertRule } from '../../domain/aggregates/audit-alert-rule';
export class AuditMonitorService {
  constructor(
    private readonly core: AuditCore,
    private readonly source: AuditEventSourcePort,
    private readonly storage?: AuditEvidenceStoragePort,
  ) {}
  replayOutbox(access: AuditAccess, id: string, reason: string): Promise<AuditObject> {
    this.core.purpose(access);
    auditText(reason, 'outbox replay reason', 2000);
    return this.core.repository.transaction(access, async (tx) => {
      const row = await this.core.requireObject(access, 'OUTBOX', id, tx);
      if (
        row.status === 'DELIVERING' &&
        Number(row.data.leaseUntil) > this.core.clock.now().getTime()
      )
        throw auditFailure('Event delivery is running.', 409);
      const result = await this.core.repository.updateObject(
        row,
        {
          status: 'PENDING',
          data: {
            ...row.data,
            attempts: 0,
            nextAttemptAt: 0,
            leaseUntil: 0,
            replayedBy: access.actorId,
            replayReason: reason,
          },
        },
        tx,
      );
      await this.core.notice(
        access,
        access.actorId,
        'audit.outbox.replayed',
        id,
        { purpose: access.purpose, reason },
        tx,
      );
      return result;
    });
  }
  acknowledge(access: AuditAccess, id: string, reason: string): Promise<AuditObject> {
    this.core.purpose(access);
    return this.core.repository.transaction(access, async (tx) => {
      const row = await this.core.requireObject(access, 'ALERT', id, tx);
      if (row.status === 'ACKNOWLEDGED') return row;
      const updated = await this.core.repository.updateObject(
        row,
        {
          status: 'ACKNOWLEDGED',
          data: {
            ...row.data,
            acknowledgedBy: access.actorId,
            acknowledgedAt: this.core.clock.now().toISOString(),
            reason: auditText(reason, 'acknowledgement reason', 2000),
          },
        },
        tx,
      );
      await this.core.notice(
        access,
        access.actorId,
        'audit.alert.acknowledged',
        id,
        { reason, purpose: access.purpose },
        tx,
      );
      return updated;
    });
  }
  async status(scope: AuditScope): Promise<Record<string, unknown>> {
    const database = await this.core.repository.transaction(scope, (tx) =>
      this.core.repository.statistics(scope, tx),
    );
    const files = (await this.storage?.statistics?.(scope.scopeKey)) || null;
    const source = this.source.status ? await this.source.status(scope) : null;
    const failures = await this.core.list(scope, 'INGESTION_FAILURE');
    const outbox = await this.core.list(scope, 'OUTBOX');
    const alerts = await this.core.list(scope, 'ALERT');
    const exports = await this.core.list(scope, 'EXPORT');
    const reconciliation = await this.core.list(scope, 'RECONCILIATION');
    const checkpoints = await this.core.list(scope, 'CHECKPOINT');
    const sourceCounters = (await this.core.list(scope, 'SOURCE_CURSOR')).find(
      (row) => row.key === 'database',
    )?.data;
    const latest = checkpoints[checkpoints.length - 1];
    return {
      storage: { databasePayload: database, files },
      source,
      ingestionLagMs: source?.oldestPendingAt
        ? Math.max(0, this.core.clock.now().getTime() - new Date(source.oldestPendingAt).getTime())
        : 0,
      retries: failures.filter((f) => f.status === 'RETRY').length,
      deadLetters: failures.filter((f) => f.status === 'DEAD').length,
      pendingOutbox: outbox.filter((o) => ['PENDING', 'RETRY', 'DELIVERING'].includes(o.status))
        .length,
      deadOutbox: outbox.filter((o) => o.status === 'DEAD').length,
      publishedEvents: outbox.filter((o) => o.status === 'PUBLISHED').length,
      databaseIngestion: sourceCounters || null,
      openAlerts: alerts.filter((a) => a.status === 'OPEN').length,
      pendingExports: exports.filter((e) =>
        ['PENDING_APPROVAL', 'APPROVED', 'PROCESSING'].includes(e.status),
      ).length,
      latestReconciliation: reconciliation[reconciliation.length - 1] || null,
      lastCheckpointAt: latest?.createdAt || null,
    };
  }
  async ingest(scope: AuditScope, input: AuditEventInput): Promise<AuditReceipt | null> {
    try {
      const normalized = normalizeAudit(input, this.core.clock.now());
      if (
        (normalized.scope === 'TENANT' ? `tenant:${normalized.tenantId}` : 'platform') !==
        scope.scopeKey
      )
        throw auditFailure('Audit source tenant mismatch.', 403);
      return await this.core.append(normalized);
    } catch (error) {
      let safe: AuditEventInput | null = null;
      try {
        safe = normalizeAudit(input, this.core.clock.now());
        if ((safe.scope === 'TENANT' ? `tenant:${safe.tenantId}` : 'platform') !== scope.scopeKey)
          safe = null;
      } catch {
        safe = null;
      }
      await this.core.repository.transaction(scope, async (tx) => {
        const key = this.core.crypto.hash(
          canonicalAudit({
            sourceId: String(input.sourceId).slice(0, 200),
            eventId: String(input.eventId).slice(0, 200),
          }),
        );
        const previous = (await this.core.repository.objects(scope, 'INGESTION_FAILURE', tx)).find(
          (row) => row.key === key,
        );
        if (previous) {
          const attempts = Number(previous.data.attempts || 0) + 1;
          await this.core.repository.updateObject(
            previous,
            {
              status: attempts >= 8 ? 'DEAD' : 'RETRY',
              data: {
                ...previous.data,
                attempts,
                nextAttemptAt:
                  this.core.clock.now().getTime() + Math.min(3600000, 2 ** attempts * 10000),
                errorType: error instanceof Error ? error.name : 'Unknown',
              },
            },
            tx,
          );
        } else
          await this.core.createObject(
            scope,
            'INGESTION_FAILURE',
            key,
            safe ? 'RETRY' : 'DEAD',
            {
              event: safe,
              attempts: 1,
              sourceId: input.sourceId,
              eventId: input.eventId,
              nextAttemptAt: this.core.clock.now().getTime() + 20000,
              errorType: error instanceof Error ? error.name : 'Unknown',
            },
            tx,
          );
      });
      return null;
    }
  }
  async drain(
    scope: AuditScope,
    reconcile = false,
  ): Promise<{
    scanned: number;
    ingested: number;
    duplicates: number;
    failed: number;
    next: string | null;
  }> {
    const cursorKey = reconcile ? 'database-reconciliation' : 'database';
    const cursorEntry = (await this.core.list(scope, 'SOURCE_CURSOR')).find(
      (row) => row.key === cursorKey,
    );
    const cursor = typeof cursorEntry?.data.cursor === 'string' ? cursorEntry.data.cursor : null;
    let batch: Awaited<ReturnType<AuditEventSourcePort['scan']>>;
    try {
      batch = await this.source.scan(scope, cursor, 500, reconcile);
    } catch (error) {
      await this.core.repository.transaction(scope, async (tx) => {
        const report = await this.core.createObject(
          scope,
          'RECONCILIATION',
          this.core.clock.id(),
          'FAILED',
          {
            source: 'database',
            complete: false,
            errorType: error instanceof Error ? error.name : 'Unknown',
          },
          tx,
        );
        await this.core.createObject(
          scope,
          'ALERT',
          report.id,
          'OPEN',
          { severity: 'CRITICAL', type: 'AUDIT_SOURCE_UNAVAILABLE', reconciliationId: report.id },
          tx,
        );
      });
      throw error;
    }
    let ingested = 0,
      duplicates = 0,
      failed = 0;
    for (const event of batch.events) {
      const result = await this.ingest(scope, event.input);
      if (!result) failed++;
      else if (result.duplicate) duplicates++;
      else ingested++;
    }
    if (!reconcile && this.source.acknowledge)
      await this.source.acknowledge(
        scope,
        batch.events.map((e) => e.input.eventId),
      );
    await this.core.repository.transaction(scope, async (tx) => {
      if (batch.next) {
        const current = (await this.core.repository.objects(scope, 'SOURCE_CURSOR', tx)).find(
          (row) => row.key === cursorKey,
        );
        const position = reconcile && batch.events.length < 500 ? null : batch.next;
        const counters = {
          cursor: position,
          scanned: Number(current?.data.scanned || 0) + batch.events.length,
          ingested: Number(current?.data.ingested || 0) + ingested,
          duplicates: Number(current?.data.duplicates || 0) + duplicates,
          failed: Number(current?.data.failed || 0) + failed,
        };
        if (current) await this.core.repository.updateObject(current, { data: counters }, tx);
        else
          await this.core.createObject(scope, 'SOURCE_CURSOR', cursorKey, 'ACTIVE', counters, tx);
      }
      if (reconcile)
        await this.core.createObject(
          scope,
          'RECONCILIATION',
          this.core.clock.id(),
          failed ? 'DIFFERENCES' : batch.events.length === 500 ? 'RUNNING' : 'COMPLETED',
          {
            source: 'database',
            scanned: batch.events.length,
            ingested,
            duplicates,
            failed,
            next: batch.next,
            complete: batch.events.length < 500,
          },
          tx,
        );
    });
    return { scanned: batch.events.length, ingested, duplicates, failed, next: batch.next };
  }
  async retry(scope: AuditScope, id: string, force = false): Promise<AuditObject> {
    const row = await this.core.objectData(scope, 'INGESTION_FAILURE', id);
    if (row.status === 'RECOVERED') return row;
    if (
      !force &&
      (row.status === 'DEAD' ||
        Number(row.data.nextAttemptAt || 0) > this.core.clock.now().getTime())
    )
      return row;
    if (!row.data.event)
      throw auditFailure('Invalid events must be repaired at their trusted source.', 409);
    const event = auditData(row.data.event) as unknown as AuditEventInput;
    const result = await this.ingest(scope, event);
    if (result)
      return this.core.repository.transaction(scope, async (tx) => {
        const current = await this.core.requireObject(scope, 'INGESTION_FAILURE', id, tx);
        const updated = await this.core.repository.updateObject(
          current,
          {
            status: 'RECOVERED',
            data: {
              ...current.data,
              recoveredAt: this.core.clock.now().toISOString(),
              recordId: result.auditRecordId,
            },
          },
          tx,
        );
        await this.core.queueEvent(
          scope,
          'audit.ingestion.recovered',
          { failureId: id, auditRecordId: result.auditRecordId },
          tx,
        );
        return updated;
      });
    return this.core.objectData(scope, 'INGESTION_FAILURE', id);
  }
  async retryDue(scope: AuditScope): Promise<void> {
    for (const row of await this.core.list(scope, 'INGESTION_FAILURE', {
      status: ['RETRY'],
      limit: 200,
    }))
      if (row.status === 'RETRY') await this.retry(scope, row.id);
  }
  async policy(
    access: AuditAccess,
    input: {
      code: string;
      eventType?: string;
      severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      sensitive: boolean;
      reason: string;
    },
  ): Promise<AuditObject> {
    input = AuditPolicy.configuration({ ...input });
    return this.core.repository.transaction(access, async (tx) => {
      const versions = (await this.core.repository.objects(access, 'POLICY', tx)).filter(
        (p) => p.data.code === input.code,
      );
      const version = Math.max(0, ...versions.map((v) => Number(v.data.version))) + 1;
      const row = await this.core.createObject(
        access,
        'POLICY',
        `${input.code}:${version}`,
        'ACTIVE',
        { ...input, version, createdBy: access.actorId },
        tx,
      );
      for (const previous of versions.filter((v) => v.status === 'ACTIVE'))
        await this.core.repository.updateObject(previous, { status: 'SUPERSEDED' }, tx);
      await this.core.notice(
        access,
        access.actorId,
        'audit.policy.created',
        row.id,
        { code: input.code, version, reason: input.reason },
        tx,
      );
      return row;
    });
  }
  alertRule(
    access: AuditAccess,
    input: {
      code: string;
      eventType?: string;
      outcome?: string;
      severity?: string;
      threshold: number;
      windowMinutes: number;
    },
  ): Promise<AuditObject> {
    input = AuditAlertRule.normalize({ ...input });
    return this.core.repository.transaction(access, async (tx) => {
      const row = await this.core.createObject(
        access,
        'ALERT_RULE',
        input.code,
        'ACTIVE',
        { ...input, createdBy: access.actorId },
        tx,
      );
      await this.core.notice(
        access,
        access.actorId,
        'audit.alert-rule.created',
        row.id,
        { code: input.code },
        tx,
      );
      return row;
    });
  }
  async evaluate(scope: AuditScope): Promise<void> {
    for (const rule of (await this.core.list(scope, 'ALERT_RULE')).filter(
      (r) => r.status === 'ACTIVE',
    )) {
      const domainRule = new AuditAlertRule(rule),
        { threshold, windowMinutes } = domainRule.configuration;
      const now = this.core.clock.now().getTime(),
        key = `${rule.id}:${Math.floor(now / (windowMinutes * 60000))}`;
      await this.core.repository.transaction(scope, async (tx) => {
        if ((await this.core.repository.objects(scope, 'ALERT', tx)).some((a) => a.key === key))
          return;
        const query = domainRule.query(this.core.clock.now());
        const records = await this.core.repository.records(scope, query, tx);
        if (records.length >= threshold)
          await this.core.createObject(
            scope,
            'ALERT',
            key,
            'OPEN',
            {
              ruleId: rule.id,
              severity: rule.data.severity || 'HIGH',
              count: records.length,
              windowMinutes,
            },
            tx,
          );
      });
    }
  }
}
