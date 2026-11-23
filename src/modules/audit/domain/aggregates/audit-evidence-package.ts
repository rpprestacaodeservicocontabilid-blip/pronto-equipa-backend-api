import { AuditManifest, AuditRecordView, auditFailure, auditText } from '../audit-contracts';
export class AuditEvidencePackage {
  static content(
    scopeKey: string,
    purpose: string,
    records: AuditRecordView[],
    createdAt: string,
  ): Omit<AuditManifest, 'checksum' | 'signature'> {
    if (
      !records.length ||
      records.length > 1000 ||
      new Set(records.map((r) => r.id)).size !== records.length ||
      records.some((r) => r.scopeKey !== scopeKey)
    )
      throw auditFailure('Evidence requires unique records from one authorized scope.');
    const ordered = structuredClone(records).sort((a, b) => a.sequence - b.sequence);
    return {
      schemaVersion: 1,
      scopeKey,
      createdAt,
      purpose: auditText(purpose, 'evidence purpose', 2000),
      records: ordered,
      recordIds: ordered.map((r) => r.id),
      firstSequence: ordered[0].sequence,
      lastSequence: ordered[ordered.length - 1].sequence,
    };
  }
}
