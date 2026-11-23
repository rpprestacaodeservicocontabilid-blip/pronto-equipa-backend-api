import { AuditObject } from '../../domain/audit-contracts';
import {
  AuditAccess,
  AuditScope,
  AuditSignature,
  auditData,
  auditText,
  auditFailure,
} from '../../domain/audit-contracts';
import { AuditIntegrityBatch } from '../../domain/aggregates/audit-integrity-batch';
import { canonicalAudit } from '../../domain/services/audit-data.service';
import { AuditEvidenceStoragePort } from '../ports/audit-engine.ports';
import { AuditCore } from './audit-core';
export class AuditIntegrityService {
  constructor(
    private readonly core: AuditCore,
    private readonly storage: AuditEvidenceStoragePort,
  ) {}
  async checkpoint(access: AuditAccess): Promise<AuditObject> {
    this.core.purpose(access);
    if (!(await this.verify(access, access.actorId)).valid)
      throw auditFailure('Cannot seal a compromised audit chain.', 409);
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
  async verify(
    scope: AuditScope,
    actor = 0,
  ): Promise<{
    valid: boolean;
    throughSequence: number;
    assurance: string;
    failures: Array<{ sequence: number; code: string }>;
    verificationId: string;
  }> {
    const head = await this.core.repository.transaction(scope, async (tx) => {
      await this.core.queueEvent(
        scope,
        'audit.integrity.verification-started',
        { actorId: actor },
        tx,
      );
      return this.core.repository.head(scope, tx);
    });
    const failures: Array<{ sequence: number; code: string }> = [];
    const batch = new AuditIntegrityBatch(head);
    let anchors: Array<{ key: string; bytes: Buffer }> = [];
    try {
      anchors = await this.storage.anchors(scope.scopeKey);
    } catch {
      failures.push({ sequence: 0, code: 'EXTERNAL_ANCHOR_UNAVAILABLE' });
    }
    const preserved = new Set(anchors.map((anchor) => anchor.key));
    for (const checkpoint of await this.core.list(scope, 'CHECKPOINT')) {
      try {
        if (checkpoint.status === 'SEALED' && !preserved.has(String(checkpoint.data.anchorKey)))
          failures.push({
            sequence: Number(auditData(checkpoint.data.statement).sequence || 0),
            code: 'MISSING_EXTERNAL_CHECKPOINT',
          });
      } catch {
        failures.push({ sequence: 0, code: 'INVALID_CHECKPOINT_METADATA' });
      }
    }
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
          statement.schemaVersion !== 1 ||
          statement.scopeKey !== scope.scopeKey ||
          !Number.isSafeInteger(n) ||
          n < 0 ||
          !this.core.crypto.verify(
            `prontoequipas:audit:checkpoint:v1:${canonicalAudit(statement)}`,
            signature,
          )
        )
          throw new Error('Invalid checkpoint signature.');
        const hash = auditText(statement.recordHash, 'checkpoint hash', 64);
        if (signed.has(n) && signed.get(n) !== hash)
          failures.push({ sequence: n, code: 'CHECKPOINT_CONFLICT' });
        if (n === 0 && hash !== '0'.repeat(64))
          failures.push({ sequence: n, code: 'INVALID_GENESIS_CHECKPOINT' });
        signed.set(n, hash);
        if (n > head.sequence) failures.push({ sequence: n, code: 'HEAD_ROLLBACK' });
      } catch {
        failures.push({ sequence: 0, code: 'INVALID_EXTERNAL_CHECKPOINT' });
      }
    }
    while (batch.sequence < head.sequence) {
      const rows = await this.core.repository.transaction(scope, (tx) =>
        this.core.repository.records(
          scope,
          { cursor: batch.sequence, throughSequence: head.sequence, limit: 100 },
          tx,
        ),
      );
      const bounded = rows.filter((row) => row.sequence <= head.sequence);
      if (!bounded.length) {
        failures.push({ sequence: batch.sequence + 1, code: 'MISSING_RECORD' });
        break;
      }
      for (const row of bounded) {
        batch.observe(row, (value) => this.core.crypto.hash(value));
        if (signed.has(row.sequence) && signed.get(row.sequence) !== row.recordHash)
          failures.push({ sequence: row.sequence, code: 'CHECKPOINT_MISMATCH' });
      }
    }
    failures.push(...batch.finish());
    const valid = failures.length === 0;
    const result = await this.core.repository.transaction(scope, async (tx) => {
      const report = await this.core.createObject(
        scope,
        'INTEGRITY_RUN',
        this.core.clock.id(),
        valid ? 'VALID' : 'VIOLATION',
        {
          throughSequence: head.sequence,
          checked: batch.sequence,
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
