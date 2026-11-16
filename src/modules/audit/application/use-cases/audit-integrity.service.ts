import {
  AuditAccess,
  AuditScope,
  AuditSignature,
  auditData,
  auditFailure,
  auditText,
} from '../../domain/audit-contracts';
import { auditSeal } from '../../domain/aggregates/audit-record';
import { canonicalAudit } from '../../domain/services/audit-data.service';
import { AuditEvidenceStoragePort } from '../ports/audit-engine.ports';
import { AuditCore } from './audit-core';
export class AuditIntegrityService {
  constructor(
    private readonly core: AuditCore,
    private readonly storage: AuditEvidenceStoragePort,
  ) {}
  async checkpoint(access: AuditAccess) {
    const id = this.core.clock.id(),
      head = await this.core.repository.transaction(access, (tx) =>
        this.core.repository.head(access, tx),
      );
    const statement = {
      schemaVersion: 1,
      scopeKey: access.scopeKey,
      sequence: head.sequence,
      recordHash: head.recordHash,
      createdAt: this.core.clock.now().toISOString(),
    };
    const signature = this.core.crypto.sign(
      `prontoequipas:audit:checkpoint:v1:${canonicalAudit(statement)}`,
    );
    const anchorKey = await this.storage.anchor(
      access.scopeKey,
      id,
      Buffer.from(canonicalAudit({ statement, signature })),
    );
    return this.core.repository.transaction(access, async (tx) => {
      const row = await this.core.createObject(
        access,
        'CHECKPOINT',
        id,
        'SEALED',
        { statement, signature, anchorKey, createdBy: access.actorId },
        tx,
      );
      await this.core.notice(
        access,
        access.actorId,
        'audit.integrity.checkpoint-sealed',
        row.id,
        { sequence: head.sequence, anchorKey, purpose: access.purpose },
        tx,
      );
      return row;
    });
  }
  async verify(scope: AuditScope, actor = 0) {
    const head = await this.core.repository.transaction(scope, (tx) =>
      this.core.repository.head(scope, tx),
    );
    const failures: Array<{ sequence: number; code: string }> = [];
    let sequence = 0,
      previous = '0'.repeat(64);
    const anchors = await this.storage.anchors(scope.scopeKey);
    const signed = new Map<number, string>();
    for (const anchor of anchors) {
      try {
        const parsed: unknown = JSON.parse(anchor.bytes.toString('utf8'));
        const data = auditData(parsed),
          statement = auditData(data.statement),
          sig = auditData(data.signature);
        const signature: AuditSignature = {
          algorithm: 'Ed25519',
          keyId: auditText(sig.keyId, 'key id'),
          signature: auditText(sig.signature, 'signature', 1000),
        };
        const n = Number(statement.sequence);
        if (
          sig.algorithm !== 'Ed25519' ||
          statement.scopeKey !== scope.scopeKey ||
          !Number.isSafeInteger(n) ||
          n < 0 ||
          !this.core.crypto.verify(
            `prontoequipas:audit:checkpoint:v1:${canonicalAudit(statement)}`,
            signature,
          )
        )
          throw new Error('Invalid checkpoint signature.');
        signed.set(n, auditText(statement.recordHash, 'checkpoint hash', 64));
        if (n > head.sequence) failures.push({ sequence: n, code: 'HEAD_ROLLBACK' });
      } catch {
        failures.push({ sequence: 0, code: 'INVALID_EXTERNAL_CHECKPOINT' });
      }
    }
    while (sequence < head.sequence) {
      const rows = await this.core.repository.transaction(scope, (tx) =>
        this.core.repository.records(scope, { cursor: sequence, limit: 1000 }, tx),
      );
      const bounded = rows.filter((row) => row.sequence <= head.sequence);
      if (!bounded.length) {
        failures.push({ sequence: sequence + 1, code: 'MISSING_RECORD' });
        break;
      }
      for (const row of bounded) {
        if (row.sequence !== sequence + 1)
          failures.push({ sequence: sequence + 1, code: 'SEQUENCE_GAP' });
        if (row.previousHash !== previous)
          failures.push({ sequence: row.sequence, code: 'PREVIOUS_HASH_MISMATCH' });
        const payloadHash = this.core.crypto.hash(canonicalAudit(auditSeal(row)));
        if (
          payloadHash !== row.payloadHash ||
          this.core.crypto.hash(`${row.previousHash}\n${payloadHash}`) !== row.recordHash
        )
          failures.push({ sequence: row.sequence, code: 'RECORD_HASH_MISMATCH' });
        if (signed.has(row.sequence) && signed.get(row.sequence) !== row.recordHash)
          failures.push({ sequence: row.sequence, code: 'CHECKPOINT_MISMATCH' });
        sequence = row.sequence;
        previous = row.recordHash;
      }
    }
    if (sequence !== head.sequence || previous !== head.recordHash)
      failures.push({ sequence: head.sequence, code: 'HEAD_MISMATCH' });
    const valid = failures.length === 0;
    const result = await this.core.repository.transaction(scope, async (tx) => {
      const report = await this.core.createObject(
        scope,
        'INTEGRITY_RUN',
        this.core.clock.id(),
        valid ? 'VALID' : 'VIOLATION',
        {
          throughSequence: head.sequence,
          checked: sequence,
          failures,
          assurance: anchors.length ? 'SIGNED_CHECKPOINTS' : 'HASH_CHAIN_ONLY',
          actorId: actor,
        },
        tx,
      );
      if (!valid)
        await this.core.createObject(
          scope,
          'ALERT',
          report.id,
          'OPEN',
          {
            type: 'INTEGRITY_VIOLATION',
            severity: 'CRITICAL',
            verificationId: report.id,
            failures,
          },
          tx,
        );
      return report;
    });
    return {
      valid,
      throughSequence: head.sequence,
      assurance: anchors.length ? 'SIGNED_CHECKPOINTS' : 'HASH_CHAIN_ONLY',
      failures,
      verificationId: result.id,
    };
  }
}
