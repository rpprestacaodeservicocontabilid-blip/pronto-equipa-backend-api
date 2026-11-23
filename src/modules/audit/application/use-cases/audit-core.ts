import { RecordStoreContext } from '../../../../shared/application/ports/record-store.port';
import { AuditObject, AuditReceipt } from '../../domain/audit-contracts';
import {
  AuditAccess,
  AuditEventInput,
  AuditObjectKind,
  AuditQuery,
  AuditRecordView,
  AuditScope,
  auditFailure,
  auditScope,
  auditText,
} from '../../domain/audit-contracts';
import { canonicalAudit, normalizeAudit } from '../../domain/services/audit-data.service';
import {
  AuditAppendPort,
  AuditClockPort,
  AuditCryptoPort,
  AuditRepositoryPort,
  AuditObjectFilter,
} from '../ports/audit-engine.ports';
import { AuditRecord, auditSeal } from '../../domain/aggregates/audit-record';
import { AuditPolicy } from '../../domain/aggregates/audit-policy';
import { AuditAlertRule } from '../../domain/aggregates/audit-alert-rule';
import {
  AuditDomainEventType,
  auditDomainEventTypes,
} from '../../domain/events/audit-domain-event';
export class AuditCore implements AuditAppendPort {
  constructor(
    readonly repository: AuditRepositoryPort,
    readonly crypto: AuditCryptoPort,
    readonly clock: AuditClockPort,
  ) {}
  async append(input: AuditEventInput, context?: RecordStoreContext): Promise<AuditReceipt> {
    const event = normalizeAudit(input, this.clock.now());
    const scope = auditScope(event.scope === 'TENANT' ? Number(event.tenantId) : null);
    return this.repository.transaction(scope, (tx) => this.persist(scope, event, tx), context);
  }
  private async persist(
    scope: AuditScope,
    event: AuditEventInput,
    tx: RecordStoreContext,
  ): Promise<AuditReceipt> {
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
    const policy = AuditPolicy.select(await this.repository.objects(scope, 'POLICY', tx), event);
    const classification = policy?.classify(event) || {
      severity: event.severity,
      sensitivity:
        event.sensitivity === 'SENSITIVE' || ['PAYROLL', 'FINANCIAL'].includes(event.category)
          ? 'SENSITIVE'
          : 'STANDARD',
    };
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
      module: auditText(event.module, 'module', 80),
      action: event.action,
      eventType: event.eventType,
      category: event.category,
      severity: classification.severity,
      outcome: event.outcome,
      actorId: event.actor.actorId || null,
      resourceType: event.resource.resourceType,
      resourceId: event.resource.resourceId,
      correlationId: event.correlationId || null,
      sensitivity: classification.sensitivity as AuditRecordView['sensitivity'],
      occurredAt: event.occurredAt,
      receivedAt: this.clock.now().toISOString(),
      policyVersion: policy?.version || 1,
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
    if (
      event.sourceId === 'audit' &&
      auditDomainEventTypes.includes(event.eventType as AuditDomainEventType)
    )
      await this.queueEvent(
        scope,
        event.eventType as AuditDomainEventType,
        { auditRecordId: row.id, resourceId: row.resourceId, recordHash: row.recordHash },
        tx,
      );
    const rules = await this.repository.objects(scope, 'ALERT_RULE', tx);
    const matched = rules
      .map((rule) => new AuditAlertRule(rule))
      .filter((rule) => rule.configuration.threshold === 1 && rule.matches(row));
    if (row.severity === 'CRITICAL' || event.outcome === 'DENIED' || matched.length) {
      await this.createObject(
        scope,
        'ALERT',
        row.id,
        'OPEN',
        {
          recordId: row.id,
          severity: row.severity,
          ruleIds: matched.map((r) => r.record.id),
          eventType: row.eventType,
          outcome: row.outcome,
        },
        tx,
      );
    }
    return { auditRecordId: row.id, sequence, recordHash: row.recordHash, duplicate: false };
  }
  async createObject(
    scope: AuditScope,
    kind: AuditObjectKind,
    key: string,
    status: string,
    data: Record<string, unknown>,
    tx: RecordStoreContext,
  ): Promise<AuditObject> {
    const now = this.clock.now().toISOString();
    const object = await this.repository.createObject(
      {
        ...auditScope(scope.companyId),
        id: this.clock.id(),
        kind,
        key,
        status,
        data,
        createdAt: now,
        updatedAt: now,
      },
      tx,
    );
    const type: AuditDomainEventType | undefined =
      kind === 'ALERT'
        ? 'audit.alert.created'
        : kind === 'INGESTION_FAILURE'
          ? 'audit.ingestion.failed'
          : kind === 'INTEGRITY_RUN'
            ? status === 'VALID'
              ? 'audit.integrity.verified'
              : 'audit.integrity.violation-detected'
            : kind === 'RECONCILIATION'
              ? status === 'COMPLETED'
                ? 'audit.reconciliation.completed'
                : ['FAILED', 'DIFFERENCES'].includes(status)
                  ? 'audit.reconciliation.failed'
                  : undefined
              : undefined;
    if (type) await this.queueEvent(scope, type, { resourceId: object.id, status }, tx);
    return object;
  }
  queueEvent(
    scope: AuditScope,
    type: AuditDomainEventType,
    payload: Record<string, unknown>,
    tx: RecordStoreContext,
  ): Promise<AuditObject> {
    return this.createObject(
      scope,
      'OUTBOX',
      this.clock.id(),
      'PENDING',
      { eventType: type, payload, attempts: 0 },
      tx,
    );
  }
  async requireObject(
    scope: AuditScope,
    kind: AuditObjectKind,
    id: string,
    tx: RecordStoreContext,
  ): Promise<AuditObject> {
    const row = await this.repository.object(scope, kind, id, tx);
    if (!row) throw auditFailure('Audit resource not found.', 404);
    return row;
  }
  assertRecordAccess(record: AuditRecordView, access: AuditAccess): void {
    if (
      record.scopeKey !== access.scopeKey ||
      (access.ownOnly &&
        (record.actorId !== String(access.actorId) ||
          (!['USER', 'AUTH_SESSION', 'user', 'session'].includes(record.resourceType) &&
            !(
              record.resourceType === 'HTTP' &&
              record.sourceId === 'http' &&
              ['ACCESS', 'SECURITY'].includes(record.category)
            )) ||
          (record.resourceType.toLowerCase() === 'user' &&
            record.resourceId !== String(access.actorId))))
    )
      throw auditFailure('Audit record not found.', 404);
    if (record.sensitivity === 'SENSITIVE' && !access.sensitive)
      throw auditFailure('Sensitive audit permission required.', 403);
  }
  async accessibleRecords(
    access: AuditAccess,
    ids: string[],
    tx: RecordStoreContext,
  ): Promise<AuditRecordView[]> {
    const rows: AuditRecordView[] = [];
    let bytes = 0;
    for (const id of [...new Set(ids)]) {
      const row = await this.repository.record(access, id, tx);
      if (!row) throw auditFailure('Audit record not found.', 404);
      this.assertRecordAccess(row, access);
      bytes += Buffer.byteLength(canonicalAudit(row), 'utf8');
      if (bytes > 16 * 1024 * 1024)
        throw auditFailure('Evidence selection exceeds 16 MiB; split the selection.', 413);
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
  ): Promise<AuditReceipt> {
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
      query.throughSequence !== undefined &&
      (!Number.isSafeInteger(query.throughSequence) || query.throughSequence < 0)
    )
      throw auditFailure('Invalid audit snapshot sequence.');
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
  purpose(access: AuditAccess): void {
    auditText(access.purpose, 'audit purpose', 2000);
  }
  async objectData(scope: AuditScope, kind: AuditObjectKind, id: string): Promise<AuditObject> {
    return this.repository.transaction(scope, (tx) => this.requireObject(scope, kind, id, tx));
  }
  list(
    scope: AuditScope,
    kind: AuditObjectKind,
    filter?: AuditObjectFilter,
  ): Promise<AuditObject[]> {
    return this.repository.transaction(scope, (tx) =>
      this.repository.objects(scope, kind, tx, filter),
    );
  }
}
