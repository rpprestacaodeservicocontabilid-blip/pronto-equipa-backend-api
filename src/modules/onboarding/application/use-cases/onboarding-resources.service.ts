import {
  DocumentUploadPort,
  DocumentScannerPort,
} from '../../../documents/application/ports/document.ports';
import { OnboardingPersistencePort } from '../ports/onboarding-store.port';

import { randomBytes, randomUUID, createHash } from 'crypto';

import { OnboardingService } from './onboarding.service';

import { OnboardingPorts, fail } from '../../domain/onboarding';

export interface OnboardingResourcePorts {
  assigneeAvailable(id: number): Promise<boolean>;
  companyTaxRegistry(): Promise<Array<{ id: number; name: string; taxId: string }>>;
  storage: DocumentUploadPort;
  scanner: DocumentScannerPort;
  inviteAddress(actor: number): Promise<string>;
  importEmployee(companyId: number, actor: number, input: any, kind?: string): Promise<any>;
  reserveEmployee(
    companyId: number,
    key: string,
  ): Promise<{ reservationId: string | null; allowed: boolean }>;
  settleEmployee(companyId: number, id: string, commit: boolean): Promise<void>;
  notify(ownerId: number, key: string, status: string): Promise<void>;
}
export class OnboardingResourcesService extends OnboardingService {
  async validateDocument(
    id: string,
    actor: number,
    documentId: string,
    approved: boolean,
    reason: string,
  ) {
    return this.persistence.applications.transaction(null, async (tx) => {
      const application = await this.access(id, actor, true, tx);
      if (application.ownerId === actor) throw fail('A validação exige outro utilizador.', 403);
      const row = await this.persistence.resources.findOne({
        where: { applicationId: id, id: documentId, kind: 'DOCUMENT', status: 'CLEAN' },
        transaction: tx,
        forUpdate: true,
      });
      if (!row) throw fail('Documento não está disponível para validação.', 409);
      await this.persistence.resources.update(
        row,
        {
          status: approved ? 'VALIDATED' : 'REJECTED',
          data: { ...row.data, reviewedBy: actor, reason, reviewedAt: new Date().toISOString() },
        },
        { transaction: tx },
      );
      await this.event(application, actor, 'onboarding.document.decision', tx, {
        documentId, decision: row.status, reason,
      });
      return { id: row.id, status: row.status };
    });
  }
  async consent(id: string, actor: number, version: string) {
    return this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, false, tx);
      if (row.companyId) throw fail('Empresa já provisionada.');
      if (row.data.createdBy && !row.data.assistedClaimedAt) throw fail('Aceite o convite antes de confirmar os termos.', 409);
      if (!['DRAFT', 'IN_PROGRESS', 'ADDITIONAL_INFO', 'REJECTED'].includes(row.status))
        throw fail('Adesão não permite alterar a confirmação dos termos.', 409);
      await this.persistence.applications.update(
        row,
        {
          status: 'IN_PROGRESS',
          data: {
            ...row.data,
            termsVersion: version,
            termsAcceptedBy: actor,
            termsAcceptedAt: new Date().toISOString(),
            approvedBy: null,
          },
        },
        { transaction: tx },
      );
      return { accepted: true };
    });
  }
  async downloadDocument(id: string, actor: number, documentId: string, admin = false) {
    await this.get(id, actor, admin);
    const row = await this.persistence.resources.findOne({
      where: {
        applicationId: id,
        id: documentId,
        kind: 'DOCUMENT',
        status: ['CLEAN', 'VALIDATED'],
      },
    });
    if (!row) throw fail('Documento indisponível.', 404);
    return { url: await this.storage.downloadUrl(row.data.cleanKey, 120), expiresInSeconds: 120 };
  }
  private get storage() {
    return this.resources.storage;
  }
  constructor(
    ports: OnboardingPorts,
    protected resources: OnboardingResourcePorts,
    persistence: OnboardingPersistencePort,
  ) {
    super(ports, persistence);
  }
  async assisted(actor: number, input: any) {
    return this.start(actor, input, true);
  }
  async invitation(id: string, actor: number, email: string) {
    const token = randomBytes(32).toString('hex'),
      hash = createHash('sha256').update(token).digest('hex');
    const expiresInSeconds = await this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, true, tx);
      if (row.companyId || row.data.mode === 'SELF_SERVICE' || row.data.assistedClaimedAt ||
        !['DRAFT', 'IN_PROGRESS', 'ADDITIONAL_INFO', 'REJECTED'].includes(row.status)) {
        throw fail('Adesão indisponível para convite.', 409);
      }
      for (const pending of await this.persistence.resources.findAll({
        where: { applicationId: id, kind: 'INVITATION', status: 'PENDING' }, transaction: tx,
      })) {
        if (Number(pending.data.expiresAt) > Date.now())
          await this.persistence.resources.update(pending, { status: 'REVOKED' }, { transaction: tx });
      }
      const ttl = Number(row.data.policy?.invitationHours ?? 24) * 3600;
      await this.persistence.resources.create(
        {
          id: randomUUID(),
          applicationId: id,
          kind: 'INVITATION',
          key: hash,
          status: 'PENDING',
          data: { email: email.toLowerCase(), expiresAt: Date.now() + ttl * 1000, issuedBy: actor },
        },
        { transaction: tx },
      );
      await this.event(row, actor, 'onboarding.invitation.created', tx);
      return ttl;
    });
    return { token, expiresInSeconds };
  }
  async accept(actor: number, token: string) {
    const email = await this.resources.inviteAddress(actor);
    const where = { kind: 'INVITATION', key: createHash('sha256').update(token).digest('hex'), status: 'PENDING' };
    const candidate = await this.persistence.resources.findOne({ where });
    if (!candidate) throw fail('Convite inválido ou expirado.', 403);
    return this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(candidate.applicationId, actor, true, tx);
      const invite = await this.persistence.resources.findOne({
        where,
        transaction: tx,
        forUpdate: true,
      });
      if (
        !invite ||
        invite.data.expiresAt <= Date.now() ||
        invite.data.email !== email.toLowerCase()
      )
        throw fail('Convite inválido ou expirado.', 403);
      if (row.companyId || row.data.assistedClaimedAt ||
        !['DRAFT', 'IN_PROGRESS', 'ADDITIONAL_INFO', 'REJECTED'].includes(row.status)) {
        throw fail('Adesão indisponível para convite.', 409);
      }
      await this.persistence.applications.update(
        row,
        {
          ownerId: actor,
          status: 'IN_PROGRESS',
          version: row.version + 1,
          data: { ...row.data, assistedClaimedAt: new Date().toISOString(), termsAcceptedBy: null, termsAcceptedAt: null, approvedBy: null },
        },
        { transaction: tx },
      );
      await this.persistence.resources.update(invite, { status: 'ACCEPTED' }, { transaction: tx });
      await this.event(row, actor, 'onboarding.invitation.accepted', tx);
      return { applicationId: row.id };
    });
  }
  async upload(
    id: string,
    actor: number,
    input: { fileName: string; sizeBytes: number; mimeType: string },
  ) {
    await this.get(id, actor);
    const resourceId = randomUUID();
    const upload = await this.storage.createUpload({
      companyId: 0,
      documentId: resourceId,
      versionId: resourceId,
      uploadId: resourceId,
      ...input,
      partSizeBytes: 5242880,
    });
    await this.persistence.resources.create({
      id: resourceId,
      applicationId: id,
      kind: 'DOCUMENT',
      key: resourceId,
      status: 'UPLOADING',
      data: { ...input, ...upload },
    });
    return { id: resourceId, ...upload };
  }
  async completeDocument(id: string, actor: number, resourceId: string) {
    await this.get(id, actor);
    const row = await this.persistence.resources.findOne({
      where: { id: resourceId, applicationId: id, kind: 'DOCUMENT' },
    });
    if (!row) throw fail('Documento não encontrado.', 404);
    if (row.status === 'CLEAN') return { id: row.id, status: row.status };
    if (row.status !== 'UPLOADING') throw fail('Documento indisponível.');
    const meta = await this.storage.completeUpload(row.data.storageKey);
    if (meta.sizeBytes !== row.data.sizeBytes) throw fail('Tamanho do ficheiro incompatível.');
    const bytes = await this.storage.readObject(row.data.storageKey);
    if (bytes.length !== row.data.sizeBytes) throw fail('Tamanho de conteúdo inválido.');
    const mime = row.data.mimeType,
      valid =
        mime === 'application/pdf'
          ? bytes.subarray(0, 5).toString() === '%PDF-'
          : mime === 'image/png'
            ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
            : bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
    if (!valid) throw fail('Conteúdo incompatível com o tipo declarado.');
    const scan = await this.resources.scanner.scan(bytes);
    const cleanKey = `onboarding/${id}/validated/${row.id}`;
    if (scan === 'CLEAN') {
      await this.storage.promoteObject(row.data.storageKey, cleanKey);
      const copy = await this.storage.readObject(cleanKey);
      if (
        !createHash('sha256')
          .update(copy)
          .digest()
          .equals(createHash('sha256').update(bytes).digest())
      ) {
        await this.storage.deleteObject(cleanKey);
        throw fail('O ficheiro mudou durante a validação.');
      }
    }
    await this.persistence.resources.update(row, {
      status: scan === 'CLEAN' ? 'CLEAN' : 'QUARANTINED',
      data: { ...row.data, cleanKey, hash: createHash('sha256').update(bytes).digest('hex') },
    });
    return { id: row.id, status: row.status };
  }
  async listResources(id: string, actor: number, kind: string) {
    await this.get(id, actor);
    const rows = await this.persistence.resources.findAll({
      where: { applicationId: id, kind },
      limit: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      ...(kind === 'IMPORT'
        ? { results: row.data.results || [], total: row.data.rows.length }
        : { fileName: row.data.fileName }),
    }));
  }
  async importBatch(
    id: string,
    actor: number,
    input: { operationKey: string; rows: any[]; kind?: string },
  ) {
    const application = await this.get(id, actor);
    if (application.status !== 'COMPLETED' || !application.companyId)
      throw fail('Active a empresa antes de importar trabalhadores.');
    return this.persistence.applications.transaction(null, async (tx) => {
      const existing = await this.persistence.resources.findOne({
        where: { applicationId: id, kind: 'IMPORT', key: input.operationKey },
        transaction: tx,
      });
      if (existing) {
        if (
          existing.data.hash !==
          createHash('sha256').update(JSON.stringify(input.rows)).digest('hex')
        )
          throw fail('Chave reutilizada.', 409);
        return { id: existing.id, status: existing.status };
      }
      const row = await this.persistence.resources.create(
        {
          id: randomUUID(),
          applicationId: id,
          kind: 'IMPORT',
          key: input.operationKey,
          status: 'QUEUED',
          data: {
            hash: createHash('sha256').update(JSON.stringify(input.rows)).digest('hex'),
            rows: input.rows.map((r) => ({ ...r, id: randomUUID() })),
            results: [],
            actor,
            kind: input.kind || 'EMPLOYEES',
            companyId: application.companyId,
          },
        },
        { transaction: tx },
      );
      return { id: row.id, status: row.status };
    });
  }
  async processImports() {
    const rows = await this.persistence.resources.findAll({
      where: { kind: 'IMPORT', status: 'QUEUED' },
      limit: 10,
    });
    for (const batch of rows)
      await this.persistence.applications.transaction(null, async (tx) => {
        const row = await this.persistence.resources.findOne({
          where: { id: batch.id, status: 'QUEUED' },
          transaction: tx,
          forUpdate: true,
          skipLocked: true,
        });
        if (!row) return;
        const results = [...row.data.results];
        for (let index = results.length; index < row.data.rows.length; index++) {
          let reservationId: string | null = null;
          let created = false;
          try {
            const reservation =
              row.data.kind === 'EMPLOYEES'
                ? await this.resources.reserveEmployee(
                    row.data.companyId,
                    `onboarding-import:${row.id}:${index}`,
                  )
                : { allowed: true, reservationId: null };
            if (!reservation.allowed) throw fail('Limite de trabalhadores excedido.');
            reservationId = reservation.reservationId;
            const employee = await this.resources.importEmployee(
              row.data.companyId,
              row.data.actor,
              row.data.rows[index],
              row.data.kind,
            );
            created = true;
            if (reservationId)
              await this.resources.settleEmployee(row.data.companyId, reservationId, true);
            results.push({ index, success: true, employeeId: employee.id });
          } catch (error) {
            if (created) throw error;
            if (reservationId)
              await this.resources.settleEmployee(row.data.companyId, reservationId, false);
            results.push({ index, success: false, error: String(error) });
          }
          await this.persistence.resources.update(
            row,
            { data: { ...row.data, results } },
            { transaction: tx },
          );
        }
        await this.persistence.resources.update(
          row,
          { status: results.some((r) => !r.success) ? 'PARTIALLY_COMPLETED' : 'COMPLETED' },
          { transaction: tx },
        );
      });
  }
  async communicate() {
    const rows = await this.persistence.applications.findAll({
      limit: 100,
      order: [['updatedAt', 'DESC']],
    });
    for (const row of rows.filter((application) => !application.data.createdBy || application.data.assistedClaimedAt))
      await this.resources.notify(
        row.ownerId,
        `onboarding:${row.id}:${row.ownerId}:${row.status}`,
        row.status,
      );
  }
}

