import { AuditObject } from '../../domain/audit-contracts';
import {
  AuditAccess,
  AuditManifest,
  AuditRecordView,
  AuditSignature,
  auditData,
  auditFailure,
  auditText,
} from '../../domain/audit-contracts';
import { canonicalAudit } from '../../domain/services/audit-data.service';
import { auditSeal } from '../../domain/aggregates/audit-record';
import { AuditEvidenceStoragePort } from '../ports/audit-engine.ports';
import { AuditCore } from './audit-core';
import { AuditEvidencePackage } from '../../domain/aggregates/audit-evidence-package';
export class AuditEvidenceService {
  constructor(
    private readonly core: AuditCore,
    private readonly storage: AuditEvidenceStoragePort,
  ) {}
  async create(
    access: AuditAccess,
    recordIds: string[],
    investigationId?: string,
  ): Promise<AuditObject> {
    this.core.purpose(access);
    if (!recordIds.length || recordIds.length > 1000)
      throw auditFailure('Evidence requires between 1 and 1000 records.');
    const records = await this.core.repository.transaction(access, async (tx) => {
      if (investigationId) {
        const investigation = await this.core.requireObject(
          access,
          'INVESTIGATION',
          investigationId,
          tx,
        );
        if (investigation.status !== 'OPEN') throw auditFailure('Investigation closed.', 409);
      }
      return this.core.accessibleRecords(access, recordIds, tx);
    });
    for (const record of records) {
      const digest = this.core.crypto.hash(canonicalAudit(auditSeal(record)));
      if (
        digest !== record.payloadHash ||
        this.core.crypto.hash(`${record.previousHash}\n${digest}`) !== record.recordHash
      )
        throw auditFailure('Cannot package compromised audit records.', 409);
    }
    records.sort((a, b) => a.sequence - b.sequence);
    const id = this.core.clock.id();
    const content = AuditEvidencePackage.content(
      access.scopeKey,
      access.purpose,
      records,
      this.core.clock.now().toISOString(),
    );
    const checksum = this.core.crypto.hash(canonicalAudit(content));
    const signature = this.core.crypto.sign(`prontoequipas:audit:evidence:v1:${checksum}`);
    const manifest: AuditManifest = { ...content, checksum, signature };
    const bytes = Buffer.from(canonicalAudit(manifest)),
      storageKey = await this.storage.put(access.scopeKey, id, bytes);
    return this.core.repository.transaction(access, async (tx) => {
      const row = await this.core.createObject(
        access,
        'EVIDENCE',
        id,
        'READY',
        {
          storageKey,
          checksum,
          fileHash: this.core.crypto.hash(bytes),
          signature,
          recordIds: content.recordIds,
          investigationId: investigationId || null,
          createdBy: access.actorId,
          sensitive: records.some((r) => r.sensitivity === 'SENSITIVE'),
          byteLength: bytes.length,
        },
        tx,
      );
      await this.core.notice(
        access,
        access.actorId,
        'audit.evidence.package-created',
        row.id,
        { checksum, count: records.length, purpose: access.purpose },
        tx,
      );
      return row;
    });
  }
  private async inspect(
    access: AuditAccess,
    id: string,
  ): Promise<{ valid: boolean; checksum: unknown; bytes: Buffer }> {
    this.core.purpose(access);
    const row = await this.core.objectData(access, 'EVIDENCE', id);
    if (row.data.sensitive === true && !access.sensitive)
      throw auditFailure('Sensitive audit permission required.', 403);
    try {
      const bytes = await this.storage.read(auditText(row.data.storageKey, 'storage key', 500));
      const parsed: unknown = JSON.parse(bytes.toString('utf8'));
      const manifest = auditData(parsed),
        sig = auditData(manifest.signature);
      const signature: AuditSignature = {
        algorithm: 'Ed25519',
        keyId: auditText(sig.keyId, 'key id'),
        signature: auditText(sig.signature, 'signature', 1000),
      };
      const { checksum, signature: ignored, ...content } = manifest;
      let valid =
        sig.algorithm === 'Ed25519' &&
        manifest.schemaVersion === 1 &&
        manifest.scopeKey === access.scopeKey &&
        this.core.crypto.hash(bytes) === row.data.fileHash &&
        this.core.crypto.hash(canonicalAudit(content)) === checksum &&
        checksum === row.data.checksum &&
        this.core.crypto.verify(`prontoequipas:audit:evidence:v1:${String(checksum)}`, signature);
      if (!Array.isArray(content.records)) valid = false;
      else if (valid)
        for (const value of content.records) {
          const data = auditData(value);
          this.core.assertRecordAccess(data as unknown as AuditRecordView, access);
          const payloadHash = this.core.crypto.hash(
            canonicalAudit(auditSeal(data as unknown as AuditRecordView)),
          );
          if (
            payloadHash !== data.payloadHash ||
            this.core.crypto.hash(`${String(data.previousHash)}\n${payloadHash}`) !==
              data.recordHash
          )
            valid = false;
        }
      return { valid, checksum: row.data.checksum, bytes };
    } catch (error) {
      const status = error instanceof Error && 'statusCode' in error ? Number(error.statusCode) : 0;
      if (status === 403 || status === 404) throw error;
      return { valid: false, checksum: row.data.checksum, bytes: Buffer.alloc(0) };
    }
  }
  async verify(access: AuditAccess, id: string): Promise<{ valid: boolean; checksum: unknown }> {
    const result = await this.inspect(access, id);
    await this.core.notice(access, access.actorId, 'audit.evidence.package-verified', id, {
      valid: result.valid,
      purpose: access.purpose,
    });
    return { valid: result.valid, checksum: result.checksum };
  }
  async download(access: AuditAccess, id: string): Promise<Buffer> {
    const result = await this.inspect(access, id);
    if (!result.valid) throw auditFailure('Evidence integrity failed.', 409);
    await this.core.notice(access, access.actorId, 'audit.evidence.downloaded', id, {
      purpose: access.purpose,
    });
    return result.bytes;
  }
}
