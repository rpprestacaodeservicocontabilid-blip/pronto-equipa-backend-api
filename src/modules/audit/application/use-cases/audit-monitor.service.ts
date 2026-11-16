import {
  AuditAccess,
  AuditEventInput,
  AuditScope,
  AuditQuery,
  auditData,
  auditFailure,
  auditText,
} from '../../domain/audit-contracts';
import { normalizeAudit, canonicalAudit } from '../../domain/services/audit-data.service';
import { AuditCore } from './audit-core';
import { AuditEventSourcePort } from '../ports/audit-engine.ports';
export class AuditMonitorService {
  constructor(
    private readonly core: AuditCore,
    private readonly source: AuditEventSourcePort,
  ) {}
  async ingest(scope: AuditScope, input: AuditEventInput) {
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
  async drain(scope: AuditScope, reconcile = false) {
    const cursorKey = reconcile ? 'database-reconciliation' : 'database';
    const cursorEntry = (await this.core.list(scope, 'SOURCE_CURSOR')).find(
      (row) => row.key === cursorKey,
    );
    const cursor = typeof cursorEntry?.data.cursor === 'string' ? cursorEntry.data.cursor : null;
    const batch = await this.source.scan(scope, cursor, 500, reconcile);
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
        if (current)
          await this.core.repository.updateObject(current, { data: { cursor: position } }, tx);
        else
          await this.core.createObject(
            scope,
            'SOURCE_CURSOR',
            cursorKey,
            'ACTIVE',
            { cursor: position },
            tx,
          );
      }
      if (reconcile)
        await this.core.createObject(
          scope,
          'RECONCILIATION',
          this.core.clock.id(),
          failed ? 'DIFFERENCES' : 'COMPLETED',
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
  async retry(scope: AuditScope, id: string, force = false) {
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
      return this.core.repository.transaction(scope, (tx) =>
        this.core.repository.updateObject(
          row,
          {
            status: 'RECOVERED',
            data: {
              ...row.data,
              recoveredAt: this.core.clock.now().toISOString(),
              recordId: result.auditRecordId,
            },
          },
          tx,
        ),
      );
    return this.core.objectData(scope, 'INGESTION_FAILURE', id);
  }
  async retryDue(scope: AuditScope) {
    for (const row of await this.core.list(scope, 'INGESTION_FAILURE'))
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
  ) {
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
  ) {
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
  async evaluate(scope: AuditScope) {
    for (const rule of (await this.core.list(scope, 'ALERT_RULE')).filter(
      (r) => r.status === 'ACTIVE',
    )) {
      const threshold = Number(rule.data.threshold || 1),
        windowMinutes = Number(rule.data.windowMinutes || 5);
      if (
        !Number.isSafeInteger(threshold) ||
        threshold < 1 ||
        threshold > 1000 ||
        !Number.isFinite(windowMinutes) ||
        windowMinutes <= 0
      )
        throw auditFailure('Invalid alert rule.');
      const now = this.core.clock.now().getTime(),
        key = `${rule.id}:${Math.floor(now / (windowMinutes * 60000))}`;
      await this.core.repository.transaction(scope, async (tx) => {
        if ((await this.core.repository.objects(scope, 'ALERT', tx)).some((a) => a.key === key))
          return;
        const query: AuditQuery = {
          from: new Date(now - windowMinutes * 60000).toISOString(),
          limit: 1000,
        };
        if (typeof rule.data.eventType === 'string') query.eventType = rule.data.eventType;
        if (typeof rule.data.outcome === 'string')
          query.outcome = rule.data.outcome as AuditQuery['outcome'];
        if (typeof rule.data.severity === 'string')
          query.severity = rule.data.severity as AuditQuery['severity'];
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
