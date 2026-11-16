import { AuditAccess, AuditQuery, auditFailure } from '../../domain/audit-contracts';
import { AuditCore } from './audit-core';
export class AuditQueryService {
  constructor(private readonly core: AuditCore) {}
  async search(access: AuditAccess, query: AuditQuery) {
    this.core.purpose(access);
    this.core.validateQuery(query);
    const data = await this.core.repository.transaction(access, (tx) =>
      this.core.repository.records(access, query, tx, access),
    );
    await this.core.notice(access, access.actorId, 'audit.records.queried', access.scopeKey, {
      purpose: access.purpose,
      filters: query,
      returned: data.length,
    });
    return {
      data,
      nextCursor:
        data.length === Math.min(query.limit || 100, 1000) ? data[data.length - 1]?.sequence : null,
    };
  }
  async get(access: AuditAccess, id: string) {
    this.core.purpose(access);
    const rows = await this.core.repository.transaction(access, (tx) =>
      this.core.accessibleRecords(access, [id], tx),
    );
    await this.core.notice(access, access.actorId, 'audit.record.read', id, {
      purpose: access.purpose,
    });
    return rows[0];
  }
  async dashboard(access: AuditAccess, query: AuditQuery = {}) {
    this.core.purpose(access);
    this.core.validateQuery(query);
    const counters = { events: 0, critical: 0, denied: 0, failures: 0, withoutCorrelation: 0 };
    const categories: Record<string, number> = {};
    let cursor = query.cursor || 0;
    const snapshot = await this.core.repository.transaction(access, (tx) =>
      this.core.repository.head(access, tx),
    );
    while (cursor < snapshot.sequence) {
      const rows = await this.core.repository.transaction(access, (tx) =>
        this.core.repository.records(access, { ...query, cursor, limit: 1000 }, tx, access),
      );
      const bounded = rows.filter((r) => r.sequence <= snapshot.sequence);
      if (!bounded.length) break;
      for (const row of bounded) {
        counters.events++;
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
    return { ...counters, categories, asOfSequence: snapshot.sequence };
  }
}
