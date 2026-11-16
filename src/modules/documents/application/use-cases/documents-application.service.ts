import { DocumentPersistencePort, DocumentRecord as Row } from '../ports/document-persistence.port';
import {
  RecordStoreContext,
  RecordStorePort,
  RecordFilter as Op,
} from '../../../../shared/application/ports/record-store.port';
import { createHash, randomUUID } from 'crypto';

import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { DocumentUploadPort, DocumentScannerPort } from '../ports/document.ports';
import { DOCUMENT_CATEGORIES } from '../../domain/document.types';

const fail = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const json = (row: Row) => row;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const mimeExt: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};
const safeName = (name: string) =>
  name
    .normalize('NFKC')
    .replace(/[\\/\0-\x1f\x7f]/g, '_')
    .trim()
    .slice(0, 240) || 'document';

export class DocumentsApplicationService {
  private enqueue?: (
    companyId: number,
    kind: 'SCAN' | 'DELETE',
    id: string,
    actorUserId: number,
  ) => Promise<void>;
  constructor(
    private readonly storage: DocumentUploadPort,
    private readonly scanner: DocumentScannerPort,
    private readonly audit: AuditRecorderPort,
    private readonly persistence: DocumentPersistencePort,
  ) {}
  setEnqueuer(
    enqueue: (
      companyId: number,
      kind: 'SCAN' | 'DELETE',
      id: string,
      actorUserId: number,
    ) => Promise<void>,
  ) {
    this.enqueue = enqueue;
  }
  private async tenant<T>(
    companyId: number,
    fn: (transaction: RecordStoreContext) => Promise<T>,
  ): Promise<T> {
    return this.persistence.collections.document.transaction(companyId, fn);
  }

  private async one(
    companyId: number,
    model: RecordStorePort<Row>,
    id: string,
    transaction?: RecordStoreContext,
  ) {
    const row = await model.findOne({
      where: { companyId, id },
      ...(transaction ? { transaction } : {}),
    });
    if (!row) throw fail('Documento não encontrado.', 404);
    return row;
  }
  private async usage(companyId: number, transaction: RecordStoreContext) {
    let row = await this.persistence.collections.documentStorageUsage.findOne({
      where: { companyId, key: 'usage' },
      transaction,
      forUpdate: true,
    });
    if (!row) {
      const now = new Date();
      row = await this.persistence.collections.documentStorageUsage.create(
        {
          id: randomUUID(),
          companyId,
          status: 'ACTIVE',
          runId: null,
          employeeId: null,
          key: 'usage',
          version: 1,
          data: {
            usedBytes: 0,
            reservedBytes: 0,
            quotaBytes: Number(process.env.DOCUMENTS_DEFAULT_QUOTA_BYTES || 107374182400),
          },
          createdAt: now,
          updatedAt: now,
        },
        { transaction },
      );
    }
    return row;
  }
  private async record(
    companyId: number,
    model: RecordStorePort<Row>,
    input: Partial<Row> & { id: string; status: string; key: string; data: Record<string, any> },
    transaction: RecordStoreContext,
  ) {
    const now = new Date();
    return model.create(
      {
        companyId,
        runId: null,
        employeeId: null,
        version: 1,
        ...input,
        createdAt: now,
        updatedAt: now,
      },
      { transaction },
    );
  }
  async createUpload(
    companyId: number,
    actor: number,
    input: {
      name: string;
      mimeType: string;
      sizeBytes: number;
      categoryCode?: string;
      confidentiality?: string;
      checksumSha256?: string;
      idempotencyKey: string;
      documentId?: string;
    },
  ) {
    const name = safeName(input.name),
      mimeType = input.mimeType.toLowerCase(),
      size = Number(input.sizeBytes),
      max = Number(process.env.DOCUMENTS_MAX_FILE_BYTES || 104857600);
    if (!mimeExt[mimeType]) throw fail('Tipo de ficheiro não permitido.');
    if (!Number.isSafeInteger(size) || size < 1 || size > max)
      throw fail(`O ficheiro deve ter entre 1 byte e ${max} bytes.`);
    if (input.checksumSha256 && !/^[a-f0-9]{64}$/i.test(input.checksumSha256))
      throw fail('SHA-256 inválido.');
    const requestHash = digest({
      name,
      mimeType,
      size,
      categoryCode: input.categoryCode || null,
      confidentiality: input.confidentiality || 'RESTRICTED',
      checksumSha256: input.checksumSha256 || null,
    });
    const existing = await this.tenant(companyId, async (tx) =>
      this.persistence.collections.documentUploadSession.findOne({
        where: { companyId, key: `idem:${input.idempotencyKey}` },
        transaction: tx,
      }),
    );
    if (existing) {
      if (existing.data.requestHash !== requestHash)
        throw fail('A chave de idempotência já foi utilizada com dados diferentes.', 409);
      return { ...existing.data, sessionId: existing.id, idempotent: true };
    }
    const id = randomUUID(),
      documentId = input.documentId || randomUUID(),
      versionId = randomUUID(),
      now = new Date();
    await this.tenant(companyId, async (tx) => {
      const category = input.categoryCode
        ? await this.persistence.collections.documentCategory.findOne({
            where: { companyId, key: input.categoryCode, status: 'ACTIVE' },
            transaction: tx,
          })
        : null;
      if (input.categoryCode && !category)
        throw fail('Categoria documental inexistente ou inactiva.', 404);
      const prior = input.documentId
        ? await this.persistence.collections.document.findOne({
            where: { companyId, id: documentId },
            transaction: tx,
            forUpdate: true,
          })
        : null;
      if (input.documentId && (!prior || !['ACTIVE', 'ARCHIVED'].includes(prior.status)))
        throw fail('Documento inexistente ou indisponível para nova versão.', 404);
      const usage = await this.usage(companyId, tx);
      const u = usage.data;
      if (Number(u.usedBytes || 0) + Number(u.reservedBytes || 0) + size > Number(u.quotaBytes))
        throw fail('Quota de armazenamento excedida.', 413);
      await this.persistence.update(
        usage,
        { data: { ...u, reservedBytes: Number(u.reservedBytes || 0) + size }, updatedAt: now },
        { transaction: tx },
      );
      const versionNumber = prior ? prior.version + 1 : 1;
      const metadata = {
        name,
        mimeType,
        sizeBytes: size,
        categoryCode: input.categoryCode || prior?.data.categoryCode || null,
        confidentiality: input.confidentiality || prior?.data.confidentiality || 'RESTRICTED',
        createdBy: actor,
        pendingVersionId: versionId,
        checksumSha256: input.checksumSha256 || null,
      };
      const doc =
        prior ||
        (await this.record(
          companyId,
          this.persistence.collections.document,
          {
            id: documentId,
            status: 'PENDING_UPLOAD',
            key: `document:${documentId}`,
            version: versionNumber,
            data: metadata,
          },
          tx,
        ));
      if (prior)
        await this.persistence.update(
          doc,
          { data: { ...prior.data, pendingVersionId: versionId }, updatedAt: now },
          { transaction: tx },
        );
      await this.record(
        companyId,
        this.persistence.collections.documentVersion,
        {
          id: versionId,
          status: 'PENDING_UPLOAD',
          runId: documentId,
          key: `version:${documentId}:${versionNumber}`,
          version: versionNumber,
          data: {
            documentId,
            version: versionNumber,
            name,
            mimeType,
            sizeBytes: size,
            createdBy: actor,
            checksumSha256: input.checksumSha256 || null,
          },
        },
        tx,
      );
      return { doc, metadata };
    });
    try {
      const allocation = await this.storage.createUpload({
        companyId,
        documentId,
        versionId,
        uploadId: id,
        fileName: name,
        sizeBytes: size,
        mimeType,
        partSizeBytes: Number(process.env.DOCUMENTS_MULTIPART_PART_BYTES || 8388608),
      });
      const data = {
        ...allocation,
        documentId,
        versionId,
        requestHash,
        expectedSizeBytes: size,
        actorUserId: actor,
        mimeType,
        name,
        checksumSha256: input.checksumSha256 || null,
        createdAt: now.toISOString(),
      };
      const session = await this.tenant(companyId, (tx) =>
        this.record(
          companyId,
          this.persistence.collections.documentUploadSession,
          {
            id,
            status: 'UPLOADING',
            key: `idem:${input.idempotencyKey}`,
            data: {
              ...data,
              storageKey: allocation.storageKey,
              multipartUploadId: allocation.multipartUploadId || null,
            },
          },
          tx,
        ),
      );
      await this.audit.record({
        companyId,
        actorUserId: actor,
        action: 'DOCUMENT_UPLOAD_STARTED',
        entityType: 'DOCUMENT',
        entityId: documentId,
        after: { name, mimeType, sizeBytes: size },
      });
      return {
        sessionId: id,
        documentId,
        versionId,
        mode: allocation.mode,
        expiresAt: allocation.expiresAt,
        parts: allocation.parts,
        storageKey: allocation.storageKey,
      };
    } catch (error) {
      await this.tenant(companyId, async (tx) => {
        const usage = await this.usage(companyId, tx);
        await this.persistence.update(
          usage,
          {
            data: {
              ...usage.data,
              reservedBytes: Math.max(0, Number(usage.data.reservedBytes || 0) - size),
            },
          },
          { transaction: tx },
        );
        await this.one(companyId, this.persistence.collections.document, documentId, tx).then((r) =>
          this.persistence.update(r, { status: 'UPLOAD_FAILED' }, { transaction: tx }),
        );
      });
      throw error;
    }
  }
  async createBatch(
    companyId: number,
    actor: number,
    input: {
      idempotencyKey: string;
      files: Array<{
        name: string;
        mimeType: string;
        sizeBytes: number;
        categoryCode?: string;
        confidentiality?: string;
        checksumSha256?: string;
      }>;
    },
  ) {
    if (input.files.length < 1 || input.files.length > 100)
      throw fail('Um lote deve conter entre 1 e 100 ficheiros.');
    const requestHash = digest(input.files);
    const existing = await this.tenant(companyId, (tx) =>
      this.persistence.collections.documentBatch.findOne({
        where: { companyId, key: `idem:${input.idempotencyKey}` },
        transaction: tx,
      }),
    );
    if (existing) {
      if (existing.data.requestHash !== requestHash)
        throw fail('Chave de idempotência do lote reutilizada com outro conteúdo.', 409);
      return this.batchProgress(companyId, existing.id);
    }
    const batchId = randomUUID();
    await this.tenant(companyId, (tx) =>
      this.record(
        companyId,
        this.persistence.collections.documentBatch,
        {
          id: batchId,
          status: 'UPLOADING',
          key: `idem:${input.idempotencyKey}`,
          data: {
            createdBy: actor,
            total: input.files.length,
            requestHash,
            createdAt: new Date().toISOString(),
          },
        },
        tx,
      ),
    );
    const created: any[] = [];
    for (let index = 0; index < input.files.length; index++) {
      const file = input.files[index];
      try {
        const upload = await this.createUpload(companyId, actor, {
          ...file,
          idempotencyKey: `${input.idempotencyKey}:${index + 1}`,
        });
        created.push({ index, ...upload, status: 'UPLOADING' });
        await this.tenant(companyId, (tx) =>
          this.record(
            companyId,
            this.persistence.collections.documentBatchItem,
            {
              id: randomUUID(),
              status: 'UPLOADING',
              runId: batchId,
              key: `item:${batchId}:${index + 1}`,
              data: {
                index: index + 1,
                documentId: upload.documentId,
                sessionId: upload.sessionId,
                name: file.name,
              },
            },
            tx,
          ),
        );
      } catch (error) {
        created.push({
          index: index + 1,
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Falha ao iniciar upload.',
        });
        await this.tenant(companyId, (tx) =>
          this.record(
            companyId,
            this.persistence.collections.documentBatchItem,
            {
              id: randomUUID(),
              status: 'FAILED',
              runId: batchId,
              key: `item:${batchId}:${index + 1}`,
              data: created[created.length - 1],
            },
            tx,
          ),
        );
      }
    }
    const failed = created.filter((item) => item.status === 'FAILED').length;
    await this.tenant(companyId, async (tx) => {
      const row = await this.one(
        companyId,
        this.persistence.collections.documentBatch,
        batchId,
        tx,
      );
      await this.persistence.update(
        row,
        {
          status: failed === created.length ? 'FAILED' : failed ? 'PARTIAL' : 'UPLOADING',
          data: { ...row.data, failed, startedAt: new Date().toISOString() },
        },
        { transaction: tx },
      );
    });
    return this.batchProgress(companyId, batchId);
  }
  async batchProgress(companyId: number, batchId: string) {
    const batch = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.documentBatch, batchId, tx),
    );
    const items = await this.tenant(companyId, (tx) =>
      this.persistence.collections.documentBatchItem.findAll({
        where: { companyId, runId: batchId },
        order: [['createdAt', 'ASC']],
        transaction: tx,
      }),
    );
    const current = await Promise.all(
      items.map(async (item) => {
        const itemData = item.data;
        if (!itemData.sessionId) return this.present(item);
        const session = await this.tenant(companyId, (tx) =>
          this.persistence.collections.documentUploadSession.findOne({
            where: { companyId, id: itemData.sessionId },
            transaction: tx,
          }),
        );
        return {
          ...this.present(item),
          status: session?.status || item.status,
          documentStatus: session?.status === 'COMPLETED' ? 'SCANNING' : session?.status,
        };
      }),
    );
    return {
      ...this.present(batch),
      items: current,
      total: items.length,
      completed: current.filter((row) =>
        ['COMPLETED', 'ACTIVE', 'PENDING_VALIDATION'].includes(row.status),
      ).length,
      failed: current.filter((row) => row.status === 'FAILED' || row.status === 'QUARANTINED')
        .length,
    };
  }
  async completeUpload(
    companyId: number,
    actor: number,
    sessionId: string,
    parts: Array<{ partNumber: number; etag: string }>,
  ) {
    const session = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.documentUploadSession, sessionId, tx),
    );
    const s = session.data;
    if (s.actorUserId !== actor)
      throw fail('Sessão de carregamento pertence a outro utilizador.', 403);
    if (session.status !== 'UPLOADING') throw fail('Sessão não está em carregamento.', 409);
    const head = await this.storage.completeUpload(
      s.storageKey,
      s.multipartUploadId || undefined,
      parts,
    );
    if (head.sizeBytes !== Number(s.expectedSizeBytes)) {
      await this.quarantineUpload(companyId, session, 'SIZE_MISMATCH');
      throw fail('O tamanho carregado não corresponde ao declarado.', 422);
    }
    await this.tenant(companyId, async (tx) => {
      await this.persistence.update(
        session,
        {
          status: 'SCANNING',
          data: { ...s, completedAt: new Date().toISOString(), etag: head.etag },
        },
        { transaction: tx },
      );
      await this.one(companyId, this.persistence.collections.document, s.documentId, tx).then((r) =>
        this.persistence.update(r, { status: 'SCANNING' }, { transaction: tx }),
      );
    });
    if (this.enqueue) await this.enqueue(companyId, 'SCAN', sessionId, actor);
    else await this.processUpload(companyId, sessionId);
    return {
      sessionId,
      documentId: s.documentId,
      status: 'SCANNING',
      message: 'Ficheiro recebido para validação de segurança.',
    };
  }
  async processUpload(companyId: number, sessionId: string) {
    const session = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.documentUploadSession, sessionId, tx),
    );
    const s = session.data;
    if (!['SCANNING', 'PROCESSING'].includes(session.status)) return { status: session.status };
    const bytes = await this.storage.readObject(s.storageKey),
      sha = createHash('sha256').update(bytes).digest('hex'),
      magic = this.detectMime(bytes),
      scan = await this.scanner.scan(bytes);
    if (
      bytes.length !== Number(s.expectedSizeBytes) ||
      magic !== s.mimeType ||
      scan !== 'CLEAN' ||
      (s.checksumSha256 && s.checksumSha256 !== sha)
    ) {
      const reason =
        scan === 'INFECTED'
          ? 'MALWARE_DETECTED'
          : scan === 'UNAVAILABLE'
            ? 'SCANNER_UNAVAILABLE'
            : magic !== s.mimeType
              ? 'MIME_MISMATCH'
              : bytes.length !== Number(s.expectedSizeBytes)
                ? 'SIZE_MISMATCH'
                : 'CHECKSUM_MISMATCH';
      await this.quarantineUpload(companyId, session, reason, sha);
      return { status: 'QUARANTINED', reason };
    }
    const version = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.documentVersion, s.versionId, tx),
    );
    const stableKey = `tenants/${companyId}/documents/${s.documentId}/versions/${version.version}/original`;
    await this.storage.promoteObject(s.storageKey, stableKey);
    const policy = await this.tenant(
      companyId,
      async (tx) =>
        (
          await this.persistence.collections.documentPolicy.findOne({
            where: { companyId, key: 'policy' },
            transaction: tx,
          })
        )?.data || {},
    );
    const status = policy.requireValidation === false ? 'ACTIVE' : 'PENDING_VALIDATION';
    await this.tenant(companyId, async (tx) => {
      await this.persistence.update(
        version,
        {
          status,
          data: {
            ...version.data,
            storageKey: stableKey,
            sha256: sha,
            scannedAt: new Date().toISOString(),
            scanner: 'clamav',
            mimeDetected: magic,
          },
        },
        { transaction: tx },
      );
      const doc = await this.one(
        companyId,
        this.persistence.collections.document,
        s.documentId,
        tx,
      );
      await this.persistence.update(
        doc,
        {
          status,
          data: {
            ...doc.data,
            checksumSha256: sha,
            ...(status === 'ACTIVE'
              ? { currentVersionId: version.id }
              : { pendingVersionId: version.id }),
          },
        },
        { transaction: tx },
      );
      await this.persistence.update(
        session,
        {
          status: 'COMPLETED',
          data: { ...s, storageKey: stableKey, sha256: sha, finishedAt: new Date().toISOString() },
        },
        { transaction: tx },
      );
      const usage = await this.usage(companyId, tx);
      await this.persistence.update(
        usage,
        {
          data: {
            ...usage.data,
            reservedBytes: Math.max(
              0,
              Number(usage.data.reservedBytes || 0) - Number(s.expectedSizeBytes),
            ),
            usedBytes: Number(usage.data.usedBytes || 0) + Number(s.expectedSizeBytes),
          },
        },
        { transaction: tx },
      );
    });
    await this.audit.record({
      companyId,
      actorUserId: s.actorUserId,
      action: 'DOCUMENT_UPLOAD_SCANNED',
      entityType: 'DOCUMENT',
      entityId: s.documentId,
      after: { status, sha256: sha },
    });
    return { status, documentId: s.documentId, versionId: s.versionId, sha256: sha };
  }
  private detectMime(bytes: Buffer) {
    if (bytes.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
    if (
      bytes.length > 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return 'image/png';
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
    if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP')
      return 'image/webp';
    if (bytes.subarray(0, 2).toString() === 'PK') {
      const zip = bytes.toString('latin1');
      if (zip.includes('word/'))
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      if (zip.includes('xl/'))
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (!bytes.includes(0)) return 'text/plain';
    return 'unknown';
  }
  private async quarantineUpload(companyId: number, session: Row, reason: string, sha?: string) {
    const s = session.data;
    await this.tenant(companyId, async (tx) => {
      await this.persistence.update(
        session,
        {
          status: 'QUARANTINED',
          data: {
            ...s,
            quarantineReason: reason,
            sha256: sha,
            quarantinedAt: new Date().toISOString(),
          },
        },
        { transaction: tx },
      );
      const doc = await this.one(
        companyId,
        this.persistence.collections.document,
        s.documentId,
        tx,
      );
      await this.persistence.update(
        doc,
        { status: 'QUARANTINED', data: { ...doc.data, quarantineReason: reason } },
        { transaction: tx },
      );
      const version = await this.one(
        companyId,
        this.persistence.collections.documentVersion,
        s.versionId,
        tx,
      );
      await this.persistence.update(
        version,
        {
          status: 'QUARANTINED',
          data: { ...version.data, quarantineReason: reason, sha256: sha || null },
        },
        { transaction: tx },
      );
      const usage = await this.usage(companyId, tx);
      await this.persistence.update(
        usage,
        {
          data: {
            ...usage.data,
            reservedBytes: Math.max(
              0,
              Number(usage.data.reservedBytes || 0) - Number(s.expectedSizeBytes),
            ),
            usedBytes: Number(usage.data.usedBytes || 0) + Number(s.expectedSizeBytes),
          },
        },
        { transaction: tx },
      );
    });
    await this.audit.record({
      companyId,
      actorUserId: s.actorUserId,
      action: 'DOCUMENT_QUARANTINED',
      entityType: 'DOCUMENT',
      entityId: s.documentId,
      after: { reason },
    });
  }
  async abortUpload(companyId: number, actor: number, id: string) {
    const session = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.documentUploadSession, id, tx),
    );
    if (session.data.actorUserId !== actor) throw fail('Sessão pertence a outro utilizador.', 403);
    if (session.status !== 'UPLOADING')
      throw fail('Só é possível cancelar uma sessão em carregamento.', 409);
    await this.storage.abortUpload(
      session.data.storageKey,
      session.data.multipartUploadId || undefined,
    );
    await this.tenant(companyId, async (tx) => {
      await this.persistence.update(session, { status: 'ABORTED' }, { transaction: tx });
      const doc = await this.one(
        companyId,
        this.persistence.collections.document,
        session.data.documentId,
        tx,
      );
      await this.persistence.update(doc, { status: 'DELETED' }, { transaction: tx });
      const usage = await this.usage(companyId, tx);
      await this.persistence.update(
        usage,
        {
          data: {
            ...usage.data,
            reservedBytes: Math.max(
              0,
              Number(usage.data.reservedBytes || 0) - Number(session.data.expectedSizeBytes),
            ),
          },
        },
        { transaction: tx },
      );
    });
    return { sessionId: id, status: 'ABORTED' };
  }
  async list(
    companyId: number,
    filter: {
      status?: string;
      employeeId?: string;
      categoryCode?: string;
      search?: string;
      page: number;
      limit: number;
    },
  ) {
    const rows = await this.tenant(companyId, (tx) =>
      this.persistence.collections.document.findAll({
        where: {
          companyId,
          ...(filter.status ? { status: filter.status } : {}),
          ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
        },
        order: [['updatedAt', 'DESC']],
        limit: filter.limit,
        offset: (filter.page - 1) * filter.limit,
        transaction: tx,
      }),
    );
    return rows.map((r) => this.present(r));
  }
  async get(companyId: number, id: string) {
    return this.tenant(companyId, async (tx) => {
      const row = await this.one(companyId, this.persistence.collections.document, id, tx);
      return this.present(row);
    });
  }
  private present(row: Row) {
    const r = json(row);
    return {
      id: r.id,
      companyId: r.companyId,
      status: r.status,
      ...r.data,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
  async updateMetadata(
    companyId: number,
    actor: number,
    id: string,
    patch: Record<string, unknown>,
  ) {
    const row = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.document, id, tx),
    );
    if (['DELETED', 'PENDING_DELETION'].includes(row.status))
      throw fail('Documento indisponível para alteração.', 409);
    const allowed = [
      'name',
      'categoryCode',
      'confidentiality',
      'tags',
      'expiresAt',
      'retentionUntil',
      'description',
    ];
    const data = { ...row.data };
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.includes(key)) throw fail(`Campo não editável: ${key}`);
      if (key === 'name' && typeof value === 'string') data.name = safeName(value);
      else data[key] = value;
    }
    await this.persistence.update(row, { data, updatedAt: new Date() });
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: 'DOCUMENT_METADATA_UPDATED',
      entityType: 'DOCUMENT',
      entityId: id,
      after: patch,
    });
    return this.present(row);
  }
  async versions(companyId: number, id: string) {
    await this.get(companyId, id);
    const rows = await this.tenant(companyId, (tx) =>
      this.persistence.collections.documentVersion.findAll({
        where: { companyId, runId: id },
        order: [['version', 'DESC']],
        transaction: tx,
      }),
    );
    return rows.map((r) => this.present(r));
  }
  async download(
    companyId: number,
    actor: number,
    id: string,
    purpose: 'DOWNLOAD' | 'PREVIEW' = 'DOWNLOAD',
  ) {
    const doc = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.document, id, tx),
    );
    if (!['ACTIVE', 'ARCHIVED'].includes(doc.status))
      throw fail('Documento ainda não está disponível para acesso.', 409);
    const version = await this.tenant(companyId, (tx) =>
      this.one(
        companyId,
        this.persistence.collections.documentVersion,
        doc.data.currentVersionId,
        tx,
      ),
    );
    const key = version.data.storageKey;
    if (!key || !key.startsWith(`tenants/${companyId}/documents/`))
      throw fail('Referência de armazenamento inválida.', 500);
    await this.tenant(companyId, (tx) =>
      this.record(
        companyId,
        this.persistence.collections.documentAccessLog,
        {
          id: randomUUID(),
          status: purpose,
          runId: id,
          employeeId: null,
          key: `access:${id}:${randomUUID()}`,
          data: {
            actorUserId: actor,
            purpose,
            versionId: version.id,
            at: new Date().toISOString(),
          },
        },
        tx,
      ),
    );
    const url = await this.storage.downloadUrl(key, 120);
    return { url, expiresInSeconds: 120, name: doc.data.name, mimeType: doc.data.mimeType };
  }
  async archive(companyId: number, actor: number, id: string, restore = false) {
    const doc = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.document, id, tx),
    );
    if (restore && doc.status !== 'ARCHIVED')
      throw fail('Só documentos arquivados podem ser restaurados.', 409);
    if (!restore && doc.status !== 'ACTIVE')
      throw fail('Só documentos activos podem ser arquivados.', 409);
    const status = restore ? 'ACTIVE' : 'ARCHIVED';
    await this.persistence.update(doc, {
      status,
      data: {
        ...doc.data,
        [restore ? 'restoredAt' : 'archivedAt']: new Date().toISOString(),
        updatedBy: actor,
      },
    });
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: restore ? 'DOCUMENT_RESTORED' : 'DOCUMENT_ARCHIVED',
      entityType: 'DOCUMENT',
      entityId: id,
    });
    return this.present(doc);
  }
  async submitValidation(companyId: number, actor: number, id: string, notes?: string) {
    const doc = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.document, id, tx),
    );
    if (doc.status !== 'PENDING_VALIDATION') throw fail('Documento não aguarda validação.', 409);
    const validation = await this.tenant(companyId, (tx) =>
      this.record(
        companyId,
        this.persistence.collections.documentValidation,
        {
          id: randomUUID(),
          status: 'PENDING',
          runId: id,
          key: `validation:${id}:${randomUUID()}`,
          data: { submittedBy: actor, notes: notes || null, submittedAt: new Date().toISOString() },
        },
        tx,
      ),
    );
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: 'DOCUMENT_VALIDATION_SUBMITTED',
      entityType: 'DOCUMENT',
      entityId: id,
    });
    return json(validation);
  }
  async decideValidation(
    companyId: number,
    actor: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    const doc = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.document, id, tx),
    );
    if (doc.status !== 'PENDING_VALIDATION') throw fail('Documento não aguarda validação.', 409);
    const pending = await this.tenant(companyId, (tx) =>
      this.persistence.collections.documentValidation.findOne({
        where: { companyId, runId: id, status: 'PENDING' },
        order: [['createdAt', 'DESC']],
        transaction: tx,
      }),
    );
    if (!pending) throw fail('Pedido de validação inexistente.', 404);
    if (pending.data.submittedBy === actor)
      throw fail('Quem submeteu não pode aprovar o próprio documento.', 403);
    const status = decision === 'APPROVED' ? 'ACTIVE' : 'REJECTED';
    await this.tenant(companyId, async (tx) => {
      await this.persistence.update(
        pending,
        {
          status: decision,
          data: {
            ...pending.data,
            decidedBy: actor,
            reason: reason || null,
            decidedAt: new Date().toISOString(),
          },
        },
        { transaction: tx },
      );
      const version = await this.one(
        companyId,
        this.persistence.collections.documentVersion,
        doc.data.pendingVersionId || doc.data.currentVersionId,
        tx,
      );
      await this.persistence.update(
        doc,
        {
          status,
          data: {
            ...doc.data,
            validationStatus: decision,
            ...(decision === 'APPROVED' ? { currentVersionId: version.id } : {}),
            pendingVersionId: null,
          },
        },
        { transaction: tx },
      );
      await this.persistence.update(
        version,
        { status, data: { ...version.data, validationStatus: decision } },
        { transaction: tx },
      );
    });
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: `DOCUMENT_VALIDATION_${decision}`,
      entityType: 'DOCUMENT',
      entityId: id,
      after: { reason },
    });
    return this.present(doc);
  }
  async associate(
    companyId: number,
    actor: number,
    id: string,
    input: { entityType: string; entityId: string; relationship?: string },
  ) {
    const allowed = [
      'EMPLOYEE',
      'CONTRACT',
      'LEAVE_REQUEST',
      'ATTENDANCE',
      'LOAN',
      'PAYROLL_RUN',
      'PAYSLIP',
      'COMPANY',
    ];
    if (!allowed.includes(input.entityType)) throw fail('Tipo de entidade não suportado.');
    await this.get(companyId, id);
    const assoc = await this.tenant(companyId, (tx) =>
      this.record(
        companyId,
        this.persistence.collections.documentAssociation,
        {
          id: randomUUID(),
          status: 'ACTIVE',
          runId: id,
          employeeId: input.entityType === 'EMPLOYEE' ? input.entityId : null,
          key: `association:${id}:${input.entityType}:${input.entityId}`,
          data: { documentId: id, ...input, createdBy: actor },
        },
        tx,
      ),
    );
    return json(assoc);
  }
  async associations(companyId: number, id: string) {
    await this.get(companyId, id);
    return this.tenant(companyId, async (tx) =>
      (
        await this.persistence.collections.documentAssociation.findAll({
          where: { companyId, runId: id, status: 'ACTIVE' },
          transaction: tx,
        })
      ).map(json),
    );
  }
  async createHold(
    companyId: number,
    actor: number,
    id: string,
    input: { reason: string; reference?: string },
  ) {
    await this.get(companyId, id);
    const hold = await this.tenant(companyId, (tx) =>
      this.record(
        companyId,
        this.persistence.collections.documentLegalHold,
        {
          id: randomUUID(),
          status: 'ACTIVE',
          runId: id,
          key: `hold:${id}:${randomUUID()}`,
          data: { ...input, createdBy: actor, createdAt: new Date().toISOString() },
        },
        tx,
      ),
    );
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: 'DOCUMENT_LEGAL_HOLD_CREATED',
      entityType: 'DOCUMENT',
      entityId: id,
      after: input,
    });
    return json(hold);
  }
  async releaseHold(companyId: number, actor: number, holdId: string, reason: string) {
    const hold = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.documentLegalHold, holdId, tx),
    );
    if (hold.status !== 'ACTIVE') throw fail('Retenção legal já encerrada.', 409);
    await this.persistence.update(hold, {
      status: 'RELEASED',
      data: {
        ...hold.data,
        releasedBy: actor,
        releaseReason: reason,
        releasedAt: new Date().toISOString(),
      },
    });
    return json(hold);
  }
  async requestDeletion(companyId: number, actor: number, id: string, reason: string) {
    const doc = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.document, id, tx),
    );
    if (['DELETED', 'PENDING_DELETION'].includes(doc.status))
      throw fail('Documento já está eliminado ou pendente de eliminação.', 409);
    const hold = await this.tenant(companyId, (tx) =>
      this.persistence.collections.documentLegalHold.findOne({
        where: { companyId, runId: id, status: 'ACTIVE' },
        transaction: tx,
      }),
    );
    if (hold) throw fail('Documento protegido por retenção legal.', 409);
    if (doc.data.retentionUntil && new Date(doc.data.retentionUntil) > new Date())
      throw fail('Prazo de retenção ainda não terminou.', 409);
    const req = await this.tenant(companyId, async (tx) => {
      const r = await this.record(
        companyId,
        this.persistence.collections.documentDeletionRequest,
        {
          id: randomUUID(),
          status: 'PENDING',
          runId: id,
          key: `deletion:${id}:${randomUUID()}`,
          data: { requestedBy: actor, reason, requestedAt: new Date().toISOString() },
        },
        tx,
      );
      await this.persistence.update(doc, { status: 'PENDING_DELETION' }, { transaction: tx });
      return r;
    });
    return json(req);
  }
  async decideDeletion(
    companyId: number,
    actor: number,
    requestId: string,
    approve: boolean,
    reason?: string,
  ) {
    const request = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.documentDeletionRequest, requestId, tx),
    );
    if (request.status !== 'PENDING') throw fail('Pedido já decidido.', 409);
    if (request.data.requestedBy === actor && approve)
      throw fail('O requerente não pode aprovar a própria eliminação.', 403);
    const status = approve ? 'APPROVED' : 'REJECTED';
    await this.tenant(companyId, async (tx) => {
      await this.persistence.update(
        request,
        {
          status,
          data: {
            ...request.data,
            decidedBy: actor,
            decisionReason: reason || null,
            decidedAt: new Date().toISOString(),
          },
        },
        { transaction: tx },
      );
      const doc = await this.one(
        companyId,
        this.persistence.collections.document,
        request.runId!,
        tx,
      );
      await this.persistence.update(
        doc,
        { status: approve ? 'PENDING_DELETION' : 'ACTIVE' },
        { transaction: tx },
      );
    });
    if (approve && this.enqueue) await this.enqueue(companyId, 'DELETE', requestId, actor);
    return { ...json(request), status };
  }
  async processDeletion(companyId: number, requestId: string) {
    const request = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.documentDeletionRequest, requestId, tx),
    );
    if (request.status !== 'APPROVED') return { status: request.status };
    const doc = await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.document, request.runId!, tx),
    );
    const versions = await this.tenant(companyId, (tx) =>
      this.persistence.collections.documentVersion.findAll({
        where: { companyId, runId: doc.id },
        transaction: tx,
      }),
    );
    for (const v of versions)
      if (v.data.storageKey) await this.storage.deleteObject(v.data.storageKey);
    const sessions = await this.tenant(companyId, (tx) =>
      this.persistence.collections.documentUploadSession.findAll({
        where: { companyId },
        transaction: tx,
      }),
    );
    for (const s of sessions)
      if (s.data.documentId === doc.id && s.data.storageKey?.includes('/quarantine/'))
        await this.storage.deleteObject(s.data.storageKey);
    await this.tenant(companyId, async (tx) => {
      await this.persistence.update(
        doc,
        { status: 'DELETED', data: { ...doc.data, deletedAt: new Date().toISOString() } },
        { transaction: tx },
      );
      const usage = await this.usage(companyId, tx),
        bytes = versions.reduce((total, v) => total + Number(v.data.sizeBytes || 0), 0);
      await this.persistence.update(
        usage,
        {
          data: {
            ...usage.data,
            usedBytes: Math.max(0, Number(usage.data.usedBytes || 0) - bytes),
          },
        },
        { transaction: tx },
      );
      await this.persistence.update(request, { status: 'COMPLETED' }, { transaction: tx });
    });
    return { documentId: doc.id, status: 'DELETED' };
  }
  async categories(companyId: number) {
    const existing = await this.tenant(companyId, (tx) =>
      this.persistence.collections.documentCategory.findAll({
        where: { companyId },
        transaction: tx,
      }),
    );
    if (existing.length) return existing.map(json);
    return this.tenant(companyId, async (tx) => {
      const rows = [];
      for (const category of DOCUMENT_CATEGORIES) {
        rows.push(
          await this.record(
            companyId,
            this.persistence.collections.documentCategory,
            {
              id: randomUUID(),
              status: 'ACTIVE',
              key: category.code,
              data: { ...category, system: true },
            },
            tx,
          ),
        );
      }
      return rows.map(json);
    });
  }
  async createCategory(
    companyId: number,
    input: { code: string; name: string; scope: string; confidentiality: string },
  ) {
    return this.tenant(companyId, async (tx) => {
      const row = await this.record(
        companyId,
        this.persistence.collections.documentCategory,
        { id: randomUUID(), status: 'ACTIVE', key: input.code, data: input },
        tx,
      );
      return json(row);
    });
  }
  async usageSummary(companyId: number) {
    return this.tenant(companyId, async (tx) => {
      const row = await this.usage(companyId, tx);
      return row.data;
    });
  }
  async getPolicy(companyId: number) {
    return this.tenant(
      companyId,
      async (tx) =>
        (
          await this.persistence.collections.documentPolicy.findOne({
            where: { companyId, key: 'policy' },
            transaction: tx,
          })
        )?.data || {
          requireValidation: true,
          defaultConfidentiality: 'RESTRICTED',
          maxFileBytes: Number(process.env.DOCUMENTS_MAX_FILE_BYTES || 104857600),
        },
    );
  }
  async updatePolicy(companyId: number, actor: number, input: Record<string, unknown>) {
    const row = await this.tenant(companyId, async (tx) => {
      const old = await this.persistence.collections.documentPolicy.findOne({
        where: { companyId, key: 'policy' },
        transaction: tx,
      });
      if (old) {
        await this.persistence.update(
          old,
          { data: { ...old.data, ...input, updatedBy: actor } },
          { transaction: tx },
        );
        return old;
      }
      return this.record(
        companyId,
        this.persistence.collections.documentPolicy,
        { id: randomUUID(), status: 'ACTIVE', key: 'policy', data: { ...input, updatedBy: actor } },
        tx,
      );
    });
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: 'DOCUMENT_POLICY_UPDATED',
      entityType: 'DOCUMENT_POLICY',
      entityId: row.id,
      after: input,
    });
    return json(row);
  }
  async accessAudit(companyId: number, id?: string, page = 1, limit = 50) {
    return this.tenant(companyId, async (tx) =>
      (
        await this.persistence.collections.documentAccessLog.findAll({
          where: { companyId, ...(id ? { runId: id } : {}) },
          order: [['createdAt', 'DESC']],
          limit,
          offset: (page - 1) * limit,
          transaction: tx,
        })
      ).map(json),
    );
  }
  async markExpired(companyId: number) {
    const rows = await this.tenant(companyId, (tx) =>
      this.persistence.collections.document.findAll({
        where: { companyId, status: { [Op.in]: ['ACTIVE', 'ARCHIVED'] } },
        limit: 1000,
        transaction: tx,
      }),
    );
    let count = 0;
    for (const doc of rows) {
      const expires = doc.data.expiresAt;
      if (!expires || new Date(expires) > new Date()) continue;
      await this.tenant(companyId, async (tx) => {
        const locked = await this.one(companyId, this.persistence.collections.document, doc.id, tx);
        if (!['ACTIVE', 'ARCHIVED'].includes(locked.status)) return;
        await this.persistence.update(
          locked,
          { status: 'EXPIRED', data: { ...locked.data, expiredAt: new Date().toISOString() } },
          { transaction: tx },
        );
        const key = `expiry:${doc.id}:${String(expires).slice(0, 10)}`;
        const old = await this.persistence.collections.documentExpiryAlert.findOne({
          where: { companyId, key },
          transaction: tx,
        });
        if (!old)
          await this.record(
            companyId,
            this.persistence.collections.documentExpiryAlert,
            {
              id: randomUUID(),
              status: 'PENDING',
              runId: doc.id,
              key,
              data: { documentId: doc.id, expiresAt: expires, createdAt: new Date().toISOString() },
            },
            tx,
          );
      });
      count++;
    }
    return count;
  }
}
