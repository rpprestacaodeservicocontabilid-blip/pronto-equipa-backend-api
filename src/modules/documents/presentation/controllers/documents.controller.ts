import { Request, Response } from 'express';
import { DocumentsApplicationService } from '../../application/use-cases/documents-application.service';
import {
  uploadSchema,
  batchSchema,
  completeSchema,
  listSchema,
  metadataSchema,
  validationSchema,
  associationSchema,
  holdSchema,
  categorySchema,
  policySchema,
} from '../schemas/documents.schema';
export class DocumentsController {
  constructor(private readonly service: DocumentsApplicationService) {}
  operations(...args: Parameters<DocumentsApplicationService['administration']>) {
    return this.service.administration(...args);
  }
  private context(req: Request, res: Response) {
    const companyId = res.req.tenant?.companyId,
      actorUserId = req.user?.userId;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Contexto da empresa obrigatório.' });
      return null;
    }
    if (!actorUserId) {
      res.status(401).json({ success: false, message: 'Autenticação obrigatória.' });
      return null;
    }
    return { companyId, actorUserId };
  }
  async uploads(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(201).json({
      success: true,
      data: await this.service.createUpload(
        c.companyId,
        c.actorUserId,
        uploadSchema.omit({ documentId: true }).strict().parse({
          ...req.body,
          idempotencyKey: req.body?.idempotencyKey || req.header('Idempotency-Key'),
        }),
      ),
    });
  }
  async createVersion(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const input = uploadSchema.omit({ documentId: true }).parse({
      ...req.body,
      idempotencyKey: req.body?.idempotencyKey || req.header('Idempotency-Key'),
    });
    res.status(201).json({
      success: true,
      data: await this.service.createUpload(c.companyId, c.actorUserId, {
        ...input,
        documentId: req.params.id,
      }),
    });
  }
  async batch(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(202).json({
      success: true,
      data: await this.service.createBatch(
        c.companyId,
        c.actorUserId,
        batchSchema.parse({
          ...req.body,
          idempotencyKey: req.body?.idempotencyKey || req.header('Idempotency-Key'),
        }),
      ),
    });
  }
  async batchProgress(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({ success: true, data: await this.service.batchProgress(c.companyId, req.params.id) });
  }
  async complete(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(202).json({
      success: true,
      data: await this.service.completeUpload(
        c.companyId,
        c.actorUserId,
        req.params.id,
        completeSchema.parse(req.body || {}).parts,
      ),
    });
  }
  async abort(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.service.abortUpload(c.companyId, c.actorUserId, req.params.id),
    });
  }
  async list(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.service.list(c.companyId, listSchema.parse(req.query)),
    });
  }
  async get(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({ success: true, data: await this.service.get(c.companyId, req.params.id) });
  }
  async metadata(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.service.updateMetadata(
        c.companyId,
        c.actorUserId,
        req.params.id,
        metadataSchema.parse(req.body),
      ),
    });
  }
  async versions(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({ success: true, data: await this.service.versions(c.companyId, req.params.id) });
  }
  async download(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.service.download(c.companyId, c.actorUserId, req.params.id, 'DOWNLOAD'),
    });
  }
  async preview(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.service.download(c.companyId, c.actorUserId, req.params.id, 'PREVIEW'),
    });
  }
  async archive(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.service.archive(c.companyId, c.actorUserId, req.params.id),
    });
  }
  async restore(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.service.archive(c.companyId, c.actorUserId, req.params.id, true),
    });
  }
  async validation(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const input = validationSchema.parse(req.body || {});
    if (req.path.endsWith('/submit'))
      res.status(201).json({
        success: true,
        data: await this.service.submitValidation(
          c.companyId,
          c.actorUserId,
          req.params.id,
          input.notes,
        ),
      });
    else
      res.json({
        success: true,
        data: await this.service.decideValidation(
          c.companyId,
          c.actorUserId,
          req.params.id,
          req.path.endsWith('/approve') ? 'APPROVED' : 'REJECTED',
          input.reason,
        ),
      });
  }
  async associate(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(201).json({
      success: true,
      data: await this.service.associate(
        c.companyId,
        c.actorUserId,
        req.params.id,
        associationSchema.parse(req.body),
      ),
    });
  }
  async associations(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({ success: true, data: await this.service.associations(c.companyId, req.params.id) });
  }
  async hold(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const input = holdSchema.parse(req.body);
    if (req.path.endsWith('/release'))
      res.json({
        success: true,
        data: await this.service.releaseHold(
          c.companyId,
          c.actorUserId,
          req.params.holdId,
          input.reason,
        ),
      });
    else
      res.status(201).json({
        success: true,
        data: await this.service.createHold(c.companyId, c.actorUserId, req.params.id, input),
      });
  }
  async deleteRequest(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(202).json({
      success: true,
      data: await this.service.requestDeletion(
        c.companyId,
        c.actorUserId,
        req.params.id,
        validationSchema.parse(req.body).reason || 'Solicitação de eliminação',
      ),
    });
  }
  async deletionDecision(req: Request, res: Response, approve: boolean) {
    const c = this.context(req, res);
    if (!c) return;
    const input = validationSchema.parse(req.body || {});
    res.json({
      success: true,
      data: await this.service.decideDeletion(
        c.companyId,
        c.actorUserId,
        req.params.id,
        approve,
        input.reason,
      ),
    });
  }
  async categories(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    if (req.method === 'POST')
      res.status(201).json({
        success: true,
        data: await this.service.createCategory(c.companyId, categorySchema.parse(req.body)),
      });
    else res.json({ success: true, data: await this.service.categories(c.companyId) });
  }
  async usage(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({ success: true, data: await this.service.usageSummary(c.companyId) });
  }
  async policy(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    if (req.method === 'PUT')
      res.json({
        success: true,
        data: await this.service.updatePolicy(
          c.companyId,
          c.actorUserId,
          policySchema.parse(req.body),
        ),
      });
    else res.json({ success: true, data: await this.service.getPolicy(c.companyId) });
  }
  async audit(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.service.accessAudit(
        c.companyId,
        req.query.documentId as string | undefined,
        Number(req.query.page || 1),
        Math.min(100, Number(req.query.limit || 50)),
      ),
    });
  }
}
