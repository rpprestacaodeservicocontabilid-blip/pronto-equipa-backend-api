import {
  AuditObject,
  AuditRecordView,
  auditFailure,
  auditStrings,
  auditText,
} from '../audit-contracts';
export interface AuditLegalHoldConfiguration {
  reason: string;
  recordIds?: string[];
  resourceType?: string;
  resourceId?: string;
  wholeScope?: boolean;
}
export class AuditLegalHold {
  constructor(readonly record: AuditObject) {
    if (record.kind !== 'LEGAL_HOLD') throw auditFailure('Invalid legal hold.');
  }
  static configuration(input: AuditLegalHoldConfiguration): AuditLegalHoldConfiguration {
    const recordIds = input.recordIds ? [...new Set(auditStrings(input.recordIds))] : undefined;
    const resourceType = input.resourceType
      ? auditText(input.resourceType, 'hold resource type')
      : undefined;
    if (
      (recordIds?.length || 0) > 1000 ||
      (!input.wholeScope && !recordIds?.length && !resourceType) ||
      (input.resourceId && !resourceType)
    )
      throw auditFailure('Specify valid legal hold selectors.');
    return {
      reason: auditText(input.reason, 'legal hold reason', 2000),
      recordIds,
      resourceType,
      resourceId: input.resourceId ? auditText(input.resourceId, 'hold resource id') : undefined,
      wholeScope: input.wholeScope === true,
    };
  }
  protects(record: AuditRecordView): boolean {
    return (
      this.record.scopeKey === record.scopeKey &&
      this.record.status === 'ACTIVE' &&
      (this.record.data.wholeScope === true ||
        (Array.isArray(this.record.data.recordIds) &&
          this.record.data.recordIds.includes(record.id)) ||
        (this.record.data.resourceType === record.resourceType &&
          (!this.record.data.resourceId || this.record.data.resourceId === record.resourceId)))
    );
  }
  release(actor: number, reason: string, at: string): Record<string, unknown> {
    if (this.record.status !== 'ACTIVE') throw auditFailure('Legal hold is not active.', 409);
    return {
      ...this.record.data,
      releasedBy: actor,
      releasedAt: at,
      releaseReason: auditText(reason, 'release reason', 2000),
    };
  }
}
