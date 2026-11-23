import {
  AuditCategory,
  AuditObject,
  AuditRecordView,
  auditCategories,
  auditFailure,
  auditText,
} from '../audit-contracts';
import { AuditLegalHold } from './audit-legal-hold';
export interface AuditRetentionConfiguration {
  category: AuditCategory;
  days: number;
  legalReference: string;
  reason: string;
  automatic?: boolean;
}
export class AuditRetentionPolicy {
  readonly configuration: AuditRetentionConfiguration;
  constructor(readonly record: AuditObject) {
    if (record.kind !== 'RETENTION') throw auditFailure('Invalid retention policy.');
    this.configuration = AuditRetentionPolicy.normalize(record.data);
  }
  static normalize(input: Record<string, unknown>): AuditRetentionConfiguration {
    if (
      !auditCategories.includes(input.category as AuditCategory) ||
      !Number.isSafeInteger(input.days) ||
      Number(input.days) < 1 ||
      Number(input.days) > 365000
    )
      throw auditFailure('Explicit valid retention category and period required.');
    return {
      category: input.category as AuditCategory,
      days: Number(input.days),
      legalReference: auditText(input.legalReference, 'retention authority', 1000),
      reason: auditText(input.reason, 'retention reason', 2000),
      automatic: input.automatic === true,
    };
  }
  cutoff(now: Date): Date {
    if (this.record.status !== 'ACTIVE') throw auditFailure('Retention policy is not active.', 409);
    return new Date(now.getTime() - this.configuration.days * 86400000);
  }
  mayArchive(
    record: AuditRecordView,
    holds: AuditLegalHold[],
    investigations: AuditObject[],
  ): boolean {
    return (
      record.scopeKey === this.record.scopeKey &&
      record.category === this.configuration.category &&
      !holds.some((hold) => hold.protects(record)) &&
      !investigations.some(
        (i) =>
          i.scopeKey === record.scopeKey &&
          i.status === 'OPEN' &&
          Array.isArray(i.data.recordIds) &&
          i.data.recordIds.includes(record.id),
      )
    );
  }
}
