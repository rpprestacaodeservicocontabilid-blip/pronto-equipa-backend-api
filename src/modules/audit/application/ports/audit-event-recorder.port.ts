import { AuditEventInput, AuditReceipt } from '../../domain/audit-contracts';
export type AuditCanonicalRecordInput = Omit<AuditEventInput, 'sourceId'> & { sourceId?: string };
/** Canonical receipt-producing contract; legacy module adapters keep their historical small DTO. */
export interface AuditEventRecorderPort {
  record(input: AuditCanonicalRecordInput): Promise<AuditReceipt>;
}
