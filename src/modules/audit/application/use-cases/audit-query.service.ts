import { AuditRecordView } from '../../domain/audit-contracts';
import {
  AuditAccess,
  AuditQuery,
  AuditObject,
  AuditObjectKind,
  auditFailure,
} from '../../domain/audit-contracts';
import { AuditCore } from './audit-core';
export class AuditQueryService {
  constructor(private readonly core: AuditCore) {}
  async listManaged(
    access: AuditAccess,
    kind: AuditObjectKind,
    offset: number,
    limit: number,
  ): Promise<{ items: AuditObject[]; total: number }> {
    this.core.purpose(access);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 200
    )
      throw auditFailure('Invalid audit management pagination.');
    const rows = (await this.core.list(access, kind)).filter(
      (row) => access.sensitive || row.data.sensitive !== true,
    );
    await this.core.notice(access, access.actorId, 'audit.management.queried', kind, {
      purpose: access.purpose,
      offset,
      limit,
    });
    return { items: rows.slice(offset, offset + limit), total: rows.length };
  }
  async getManaged(access: AuditAccess, kind: AuditObjectKind, id: string): Promise<AuditObject> {
    this.core.purpose(access);
    const row = await this.core.objectData(access, kind, id);
    if (row.data.sensitive === true && !access.sensitive)
      throw auditFailure('Sensitive audit permission required.', 403);
    await this.core.notice(access, access.actorId, 'audit.management.read', id, {
      purpose: access.purpose,
      kind,
    });
    return row;
  }
  async search(
    access: AuditAccess,
    query: AuditQuery,
  ): Promise<{ data: AuditRecordView[]; nextCursor: number | null; throughSequence: number }> {
    this.core.purpose(access);
    this.core.validateQuery(query);
    const { data, throughSequence } = await this.core.repository.transaction(access, async (tx) => {
      const head = await this.core.repository.head(access, tx);
      const throughSequence = Math.min(query.throughSequence ?? head.sequence, head.sequence);
      return {
        throughSequence,
        data: await this.core.repository.records(access, { ...query, throughSequence }, tx, access),
      };
    });
    await this.core.notice(access, access.actorId, 'audit.records.queried', access.scopeKey, {
      purpose: access.purpose,
      filters: query,
      returned: data.length,
    });
    return {
      data,
      throughSequence,
      nextCursor:
        data.length === Math.min(query.limit || 100, 1000) ? data[data.length - 1]?.sequence : null,
    };
  }
  async get(access: AuditAccess, id: string): Promise<AuditRecordView> {
    this.core.purpose(access);
    const rows = await this.core.repository.transaction(access, (tx) =>
      this.core.accessibleRecords(access, [id], tx),
    );
    await this.core.notice(access, access.actorId, 'audit.record.read', id, {
      purpose: access.purpose,
    });
    return rows[0];
  }
  async dashboard(
    access: AuditAccess,
    query: AuditQuery = {},
  ): Promise<{
    events: number;
    critical: number;
    denied: number;
    failures: number;
    withoutCorrelation: number;
    categories: Record<string, number>;
    asOfSequence: number;
    daily: { date: string; events: number }[];
  }> {
    this.core.purpose(access);
    this.core.validateQuery(query);
    const counters = { events: 0, critical: 0, denied: 0, failures: 0, withoutCorrelation: 0 };
    const categories: Record<string, number> = {};
    const byDay = new Map<string, number>();
    let cursor = query.cursor || 0;
    const snapshot = await this.core.repository.transaction(access, (tx) =>
      this.core.repository.head(access, tx),
    );
    const throughSequence = Math.min(snapshot.sequence, query.throughSequence ?? snapshot.sequence);
    while (cursor < throughSequence) {
      const rows = await this.core.repository.transaction(access, (tx) =>
        this.core.repository.records(access, { ...query, cursor, throughSequence, limit: 1000 }, tx, access),
      );
      const bounded = rows.filter((r) => r.sequence <= throughSequence);
      if (!bounded.length) break;
      for (const row of bounded) {
        counters.events++;
        const date = new Date(Date.parse(row.occurredAt) + 3600000).toISOString().slice(0, 10);
        byDay.set(date, (byDay.get(date) ?? 0) + 1);
        if (row.severity === 'CRITICAL') counters.critical++;
        if (row.outcome === 'DENIED') counters.denied++;
        if (row.outcome === 'FAILURE') counters.failures++;
        if (!row.correlationId) counters.withoutCorrelation++;
        categories[row.category] = (categories[row.category] || 0) + 1;
      }
      cursor = bounded[bounded.length - 1]!.sequence;
    }
    await this.core.notice(access, access.actorId, 'audit.report.read', access.scopeKey, {
      purpose: access.purpose,
    });
    const daily = [...byDay.entries()].sort(([left], [right]) => left.localeCompare(right))
      .slice(-31).map(([date, events]) => ({ date, events }));
    return { ...counters, categories, daily, asOfSequence: throughSequence };
  }
}
