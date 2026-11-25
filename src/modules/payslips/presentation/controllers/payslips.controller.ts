import { Request, Response } from 'express';
import { z } from 'zod';
import { PayslipsApplicationService } from '../../application/use-cases/payslips-application.service';
import {
  correctionSchema,
  createPayslipBatchSchema,
  employeeUserLinkSchema,
  exportReportSchema,
  generatePayslipSchema,
  listQuerySchema,
  payslipPolicySchema,
  previewTemplateSchema,
  publishSchema,
  templateSchema,
  templateVersionSchema,
} from '../schemas/payslips.schema';

const issuanceQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) });

export class PayslipsController {
  constructor(private readonly payslips: PayslipsApplicationService) {}
  async issuanceRuns(req: Request, res: Response) {
    const company = this.companyId(res);
    if (company) res.json({ success: true, data: await this.payslips.issuanceRuns(company, issuanceQuery.parse(req.query).page) });
  }
  async issuanceResults(req: Request, res: Response) {
    const company = this.companyId(res);
    if (!company) return;
    const { page, employeeId } = issuanceQuery.extend({ employeeId: z.string().uuid().optional() }).parse(req.query);
    res.json({ success: true, data: await this.payslips.issuanceResults(company, req.params.id, page, employeeId) });
  }
  async issuanceTemplates(_req: Request, res: Response) {
    const company = this.companyId(res);
    if (company) res.json({ success: true, data: await this.payslips.issuanceTemplates(company) });
  }
  async list(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    res.status(200).json({
      success: true,
      ...(await this.payslips.list(companyId, listQuerySchema.parse(req.query))),
    });
  }
  async generate(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(201).json({
      success: true,
      data: await this.payslips.generate(
        c.companyId,
        c.actorUserId,
        generatePayslipSchema.parse(req.body),
      ),
    });
  }
  async get(req: Request, res: Response) {
    const id = this.companyId(res);
    if (!id) return;
    res.status(200).json({ success: true, data: await this.payslips.get(id, req.params.id) });
  }
  async download(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const file = await this.payslips.download(c.companyId, req.params.id, c.actorUserId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('X-Document-SHA256', file.hash);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.file);
  }
  async print(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const file = await this.payslips.download(c.companyId, req.params.id, c.actorUserId, 'PRINT');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
    res.setHeader('X-Document-SHA256', file.hash);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.file);
  }
  async preview(req: Request, res: Response) {
    const id = this.companyId(res);
    if (!id) return;
    res.status(200).json({ success: true, data: await this.payslips.preview(id, req.params.id) });
  }
  async publish(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const input = publishSchema.parse(req.body ?? {});
    res.status(200).json({
      success: true,
      data: await this.payslips.publish(c.companyId, c.actorUserId, req.params.id, input),
    });
  }
  async history(req: Request, res: Response) {
    const id = this.companyId(res);
    if (!id) return;
    res.status(200).json({ success: true, data: await this.payslips.history(id, req.params.id) });
  }
  async verification(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res
      .status(200)
      .json({ success: true, data: await this.payslips.verification(c.companyId, req.params.id, c.actorUserId) });
  }
  async listBatches(req: Request, res: Response) {
    const id = this.companyId(res);
    if (!id) return;
    res.status(200).json({ success: true, data: await this.payslips.listBatches(id) });
  }
  async createBatch(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(201).json({
      success: true,
      data: await this.payslips.createBatch(
        c.companyId,
        c.actorUserId,
        createPayslipBatchSchema.parse(req.body),
      ),
    });
  }
  async getBatch(req: Request, res: Response) {
    const id = this.companyId(res);
    if (!id) return;
    res.status(200).json({ success: true, data: await this.payslips.getBatch(id, req.params.id) });
  }
  async generateBatch(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const result = await this.payslips.requestBatchGeneration(
      c.companyId,
      c.actorUserId,
      req.params.id,
    );
    res.status(result.queued ? 202 : 200).json({ success: true, data: result });
  }
  async batchProgress(req: Request, res: Response) {
    const id = this.companyId(res);
    if (!id) return;
    res
      .status(200)
      .json({ success: true, data: await this.payslips.getBatchProgress(id, req.params.id) });
  }
  async retryFailed(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(200).json({
      success: true,
      data: await this.payslips.retryFailed(c.companyId, c.actorUserId, req.params.id),
    });
  }
  async publishBatch(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(200).json({
      success: true,
      data: await this.payslips.publishBatch(c.companyId, c.actorUserId, req.params.id),
    });
  }
  async listTemplates(req: Request, res: Response) {
    const id = this.companyId(res);
    if (!id) return;
    res.status(200).json({ success: true, data: await this.payslips.listTemplates(id) });
  }
  async createTemplate(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(201).json({
      success: true,
      data: await this.payslips.createTemplate(
        c.companyId,
        c.actorUserId,
        templateSchema.parse(req.body),
      ),
    });
  }
  async getTemplate(req: Request, res: Response) {
    const id = this.companyId(res);
    if (!id) return;
    res
      .status(200)
      .json({ success: true, data: await this.payslips.getTemplate(id, req.params.id) });
  }
  async createTemplateVersion(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const input = templateVersionSchema.omit({ templateId: true }).parse(req.body);
    res.status(201).json({
      success: true,
      data: await this.payslips.createTemplateVersion(c.companyId, c.actorUserId, {
        ...input,
        templateId: req.params.id,
      }),
    });
  }
  async previewTemplate(req: Request, res: Response) {
    const id = this.companyId(res);
    if (!id) return;
    const input = previewTemplateSchema.parse({ templateId: req.params.id, ...req.body });
    res.status(200).json({
      success: true,
      data: await this.payslips.previewTemplate(id, input.templateId, input.version),
    });
  }
  async publishTemplateVersion(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(200).json({
      success: true,
      data: await this.payslips.publishTemplateVersion(c.companyId, c.actorUserId, req.params.id),
    });
  }
  async createCorrection(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const input = correctionSchema.parse(req.body);
    res.status(201).json({
      success: true,
      data: await this.payslips.createCorrection(c.companyId, c.actorUserId, req.params.id, input),
    });
  }
  async getCorrections(req: Request, res: Response) {
    const id = this.companyId(res);
    if (!id) return;
    res
      .status(200)
      .json({ success: true, data: await this.payslips.getCorrections(id, req.params.id) });
  }
  async duplicateCopy(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(201).json({
      success: true,
      data: await this.payslips.duplicateCopy(c.companyId, c.actorUserId, req.params.id),
    });
  }
  async myPayslips(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(200).json({
      success: true,
      ...(await this.payslips.myPayslips(
        c.companyId,
        c.actorUserId,
        listQuerySchema.parse(req.query),
      )),
    });
  }
  async myPayslip(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(200).json({
      success: true,
      data: await this.payslips.myPayslip(c.companyId, c.actorUserId, req.params.id),
    });
  }
  async myDownload(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const file = await this.payslips.myDownload(c.companyId, c.actorUserId, req.params.id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('X-Document-SHA256', file.hash);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.file);
  }
  async summary(req: Request, res: Response) {
    const id = this.companyId(res);
    if (!id) return;
    res.status(200).json({ success: true, data: await this.payslips.reportSummary(id) });
  }
  async export(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const file = await this.payslips.exportReport(
      c.companyId,
      c.actorUserId,
      exportReportSchema.parse(req.body ?? {}),
    );
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Report-Rows', String(file.rows));
    res.send(file.file);
  }
  async linkEmployee(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const input = employeeUserLinkSchema.parse(req.body);
    res.status(201).json({
      success: true,
      data: await this.payslips.linkEmployee(
        c.companyId,
        c.actorUserId,
        req.params.employeeId,
        input.userId,
      ),
    });
  }
  async getPolicy(req: Request, res: Response) {
    const id = this.companyId(res);
    if (!id) return;
    res.status(200).json({ success: true, data: await this.payslips.getPolicy(id) });
  }
  async updatePolicy(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(201).json({
      success: true,
      data: await this.payslips.updatePolicy(
        c.companyId,
        c.actorUserId,
        payslipPolicySchema.parse(req.body),
      ),
    });
  }
  private context(req: Request, res: Response) {
    const companyId = this.companyId(res),
      actorUserId = req.user?.userId;
    if (!companyId) return null;
    if (!actorUserId) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return null;
    }
    return { companyId, actorUserId };
  }
  private companyId(res: Response) {
    const companyId = res.req.tenant?.companyId;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company context is required.' });
      return null;
    }
    return companyId;
  }
}
