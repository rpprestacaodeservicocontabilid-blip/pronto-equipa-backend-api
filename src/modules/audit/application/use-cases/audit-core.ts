import { RecordStoreContext } from '../../../../shared/application/ports/record-store.port';
import {
  AuditAccess,
  AuditEventInput,
  AuditObject,
  AuditObjectKind,
  AuditQuery,
  AuditRecordView,
  AuditScope,
  auditData,
  auditFailure,
  auditScope,
  auditStrings,
  auditText,
} from '../../domain/audit-contracts';
import { canonicalAudit, normalizeAudit } from '../../domain/services/audit-data.service';
import {
  AuditAppendPort,
  AuditClockPort,
  AuditCryptoPort,
  AuditRepositoryPort,
} from '../ports/audit-engine.ports';
import { AuditRecord, auditSeal } from '../../domain/aggregates/audit-record';
export class AuditCore implements AuditAppendPort {
  constructor(
    readonly repository: AuditRepositoryPort,
    readonly crypto: AuditCryptoPort,
    readonly clock: AuditClockPort,
  ) {}
  async append(input: AuditEventInput, context?: RecordStoreContext) {
    const event = normalizeAudit(input, this.clock.now());
    const scope = auditScope(event.scope === 'TENANT' ? Number(event.tenantId) : null);
    return this.repository.transaction(scope, (tx) => this.persist(scope, event, tx), context);
  }
  private async persist(scope: AuditScope, event: AuditEventInput, tx: RecordStoreContext) {
    const inputHash = this.crypto.hash(canonicalAudit(event)),
      old = await this.repository.byEvent(scope, event.sourceId, event.eventId, tx);
    if (old) {
      if (old.inputHash !== inputHash)
        throw auditFailure('Audit event identity was reused with different data.', 409);
      return {
        auditRecordId: old.id,
        sequence: old.sequence,
        recordHash: old.recordHash,
        duplicate: true,
      };
    }
    const policies = await this.repository.objects(scope, 'POLICY', tx),
      policy = policies
        .filter(
          (p) =>
            p.status === 'ACTIVE' && (!p.data.eventType || p.data.eventType === event.eventType),
        )
        .sort((a, b) => Number(b.data.version) - Number(a.data.version))[0];
    const severity = policy?.data.severity
      ? auditText(policy.data.severity, 'policy severity')
      : event.severity;
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity))
      throw auditFailure('Invalid audit policy.');
    const sensitive =
      event.sensitivity === 'SENSITIVE' ||
      policy?.data.sensitive === true ||
      ['PAYROLL', 'FINANCIAL'].includes(event.category);
    const head = await this.repository.head(scope, tx),
      sequence = head.sequence + 1;
    if (!Number.isSafeInteger(sequence)) throw auditFailure('Audit sequence exhausted.');
    const row: AuditRecordView = {
      ...scope,
      id: this.clock.id(),
      eventId: event.eventId,
      sourceId: event.sourceId,
      sequence,
      schemaVersion: 1,
      eventType: event.eventType,
      category: event.category,
      severity: severity as AuditRecordView['severity'],
      outcome: event.outcome,
      actorId: event.actor.actorId || null,
      resourceType: event.resource.resourceType,
      resourceId: event.resource.resourceId,
      correlationId: event.correlationId || null,
      sensitivity: sensitive ? 'SENSITIVE' : 'STANDARD',
      occurredAt: event.occurredAt,
      receivedAt: this.clock.now().toISOString(),
      policyVersion: policy ? Number(policy.data.version) : 1,
      inputHash,
      previousHash: head.recordHash,
      payloadHash: '',
      recordHash: '',
      payload: event,
    };
    row.payloadHash = this.crypto.hash(canonicalAudit(auditSeal(row)));
    row.recordHash = this.crypto.hash(`${row.previousHash}\n${row.payloadHash}`);
    await this.repository.insert(new AuditRecord(row).toPrimitives(), tx);
    await this.repository.advance({ ...scope, sequence, recordHash: row.recordHash }, tx);
    await this.createObject(
      scope,
      'OUTBOX',
      row.id,
      'PENDING',
      { eventType: 'audit.record.persisted', recordId: row.id, recordHash: row.recordHash },
      tx,
    );
    const rules = await this.repository.objects(scope, 'ALERT_RULE', tx);
    const matched = rules.filter(
      (rule) =>
        rule.status === 'ACTIVE' &&
        Number(rule.data.threshold || 1) <= 1 &&
        (!rule.data.eventType || rule.data.eventType === event.eventType) &&
        (!rule.data.outcome || rule.data.outcome === event.outcome) &&
        (!rule.data.severity || rule.data.severity === row.severity),
    );
    if (row.severity === 'CRITICAL' || event.outcome === 'DENIED' || matched.length) {
      await this.createObject(
        scope,
        'ALERT',
        row.id,
        'OPEN',
        {
          recordId: row.id,
          severity: row.severity,
          ruleIds: matched.map((r) => r.id),
          eventType: row.eventType,
          outcome: row.outcome,
        },
        tx,
      );
    }
    return { auditRecordId: row.id, sequence, recordHash: row.recordHash, duplicate: false };
  }
  createObject(
    scope: AuditScope,
    kind: AuditObjectKind,
    key: string,
    status: string,
    data: Record<string, unknown>,
    tx: RecordStoreContext,
  ) {
    const now = this.clock.now().toISOString();
    return this.repository.createObject(
      { ...scope, id: this.clock.id(), kind, key, status, data, createdAt: now, updatedAt: now },
      tx,
    );
  }
  async requireObject(
    scope: AuditScope,
    kind: AuditObjectKind,
    id: string,
    tx: RecordStoreContext,
  ) {
    const row = await this.repository.object(scope, kind, id, tx);
    if (!row) throw auditFailure('Audit resource not found.', 404);
    return row;
  }
  assertRecordAccess(record: AuditRecordView, access: AuditAccess) {
    if (
      record.scopeKey !== access.scopeKey ||
      (access.ownOnly &&
        (record.actorId !== String(access.actorId) ||
          !['USER', 'AUTH_SESSION', 'user', 'session'].includes(record.resourceType) ||
          (record.resourceType.toLowerCase() === 'user' &&
            record.resourceId !== String(access.actorId))))
    )
      throw auditFailure('Audit record not found.', 404);
    if (record.sensitivity === 'SENSITIVE' && !access.sensitive)
      throw auditFailure('Sensitive audit permission required.', 403);
  }
  async accessibleRecords(access: AuditAccess, ids: string[], tx: RecordStoreContext) {
    const rows: AuditRecordView[] = [];
    for (const id of [...new Set(ids)]) {
      const row = await this.repository.record(access, id, tx);
      if (!row) throw auditFailure('Audit record not found.', 404);
      this.assertRecordAccess(row, access);
      rows.push(row);
    }
    return rows;
  }
  notice(
    scope: AuditScope,
    actor: number,
    action: string,
    resourceId: string,
    metadata: Record<string, unknown>,
    tx?: RecordStoreContext,
  ) {
    return this.append(
      {
        eventId: this.clock.id(),
        eventType: action,
        sourceId: 'audit',
        category: action.includes('export') ? 'EXPORT' : 'COMPLIANCE',
        severity: 'MEDIUM',
        scope: scope.companyId === null ? 'PLATFORM' : 'TENANT',
        tenantId: scope.companyId === null ? undefined : String(scope.companyId),
        actor:
          actor > 0
            ? { actorType: 'USER', actorId: String(actor) }
            : { actorType: 'SERVICE', actorId: 'audit-worker' },
        action,
        resource: { resourceType: 'AUDIT', resourceId },
        outcome: 'SUCCESS',
        occurredAt: this.clock.now().toISOString(),
        metadata,
      },
      tx,
    );
  }
  validateQuery(query: AuditQuery): AuditQuery {
    if (
      (query.from && Number.isNaN(new Date(query.from).getTime())) ||
      (query.to && Number.isNaN(new Date(query.to).getTime()))
    )
      throw auditFailure('Invalid audit date range.');
    if (query.from && query.to && new Date(query.from) > new Date(query.to))
      throw auditFailure('Inverted audit date range.');
    if (query.cursor !== undefined && (!Number.isSafeInteger(query.cursor) || query.cursor < 0))
      throw auditFailure('Invalid audit cursor.');
    if (
      query.limit !== undefined &&
      (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 1000)
    )
      throw auditFailure('Audit query limit must be between 1 and 1000.');
    return query;
  }
  purpose(access: AuditAccess) {
    auditText(access.purpose, 'audit purpose', 2000);
  }
  async objectData(scope: AuditScope, kind: AuditObjectKind, id: string) {
    return this.repository.transaction(scope, (tx) => this.requireObject(scope, kind, id, tx));
  }
  list(scope: AuditScope, kind: AuditObjectKind) {
    return this.repository.transaction(scope, (tx) => this.repository.objects(scope, kind, tx));
  }
}
