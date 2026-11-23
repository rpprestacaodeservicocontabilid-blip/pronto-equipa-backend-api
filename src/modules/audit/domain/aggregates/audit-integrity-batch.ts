import { AuditHead, AuditRecordView } from '../audit-contracts';
import { canonicalAudit } from '../services/audit-data.service';
import { auditSeal } from './audit-record';
export class AuditIntegrityBatch {
  sequence = 0;
  previousHash = '0'.repeat(64);
  readonly failures: Array<{ sequence: number; code: string }> = [];
  constructor(readonly head: AuditHead) {}
  observe(record: AuditRecordView, hash: (value: string) => string): void {
    if (record.scopeKey !== this.head.scopeKey)
      this.failures.push({ sequence: record.sequence, code: 'SCOPE_MISMATCH' });
    if (record.sequence !== this.sequence + 1)
      this.failures.push({ sequence: this.sequence + 1, code: 'SEQUENCE_GAP' });
    if (record.previousHash !== this.previousHash)
      this.failures.push({ sequence: record.sequence, code: 'PREVIOUS_HASH_MISMATCH' });
    try {
      const digest = hash(canonicalAudit(auditSeal(record)));
      if (
        digest !== record.payloadHash ||
        hash(`${record.previousHash}\n${digest}`) !== record.recordHash
      )
        this.failures.push({ sequence: record.sequence, code: 'RECORD_HASH_MISMATCH' });
    } catch {
      this.failures.push({ sequence: record.sequence, code: 'INVALID_RECORD_PAYLOAD' });
    }
    this.sequence = record.sequence;
    this.previousHash = record.recordHash;
  }
  finish(): Array<{ sequence: number; code: string }> {
    if (this.sequence !== this.head.sequence || this.previousHash !== this.head.recordHash)
      this.failures.push({ sequence: this.head.sequence, code: 'HEAD_MISMATCH' });
    return this.failures;
  }
}
