import { Request, Response } from 'express';
import { ReportsApplicationService } from '../../application/use-cases/reports-application.service';
import {
  executeReportSchema,
  exportReportSchema,
  reportFiltersSchema,
  customReportSchema,
  scheduleSchema,
} from '../schemas/reports.schema';

export class ReportsController {
  constructor(private readonly reports: ReportsApplicationService) {}
  catalog(_req: Request, res: Response) {
    res.json({ success: true, data: this.reports.catalog() });
  }
  async execute(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const input = executeReportSchema.parse(req.body);
    res.status(201).json({
      success: true,
      data: await this.reports.execute(c.companyId, c.actorUserId, input.code, input.filters),
    });
  }
  async executions(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.reports.listExecutions(
        c.companyId,
        c.actorUserId,
        Number(req.query.limit || 30),
      ),
    });
  }
  async execution(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.reports.getExecution(c.companyId, c.actorUserId, req.params.id),
    });
  }
  async export(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const input = exportReportSchema.parse(req.body);
    const value = await this.reports.createExport(
      c.companyId,
      c.actorUserId,
      input.code,
      input.format,
      input.filters,
    );
    res.status(202).json({ success: true, data: value });
  }
  async download(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const file = await this.reports.downloadExport(c.companyId, c.actorUserId, req.params.id);
    const ext = file.filename.split('.').pop();
    const mime =
      ext === 'pdf'
        ? 'application/pdf'
        : ext === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv; charset=utf-8';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.content);
  }
  async dashboard(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const filters = reportFiltersSchema.parse(req.query);
    res.json({ success: true, data: await this.reports.dashboard(companyId, filters) });
  }
  async customReports(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    if (req.method === 'POST') {
      const input = customReportSchema.parse(req.body);
      res.status(201).json({
        success: true,
        data: await this.reports.saveCustomReport(c.companyId, c.actorUserId, input),
      });
      return;
    }
    res.json({
      success: true,
      data: await this.reports.listCustomReports(c.companyId, c.actorUserId),
    });
  }
  async publishCustomReport(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.reports.publishCustomReport(c.companyId, c.actorUserId, req.params.id),
    });
  }
  async schedules(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    if (req.method === 'POST') {
      const input = scheduleSchema.parse(req.body);
      res.status(201).json({
        success: true,
        data: await this.reports.createSchedule(c.companyId, c.actorUserId, input),
      });
      return;
    }
    res.json({ success: true, data: await this.reports.schedules(c.companyId, c.actorUserId) });
  }
  async scheduleAction(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.reports.updateSchedule(
        c.companyId,
        c.actorUserId,
        req.params.id,
        req.params.action as 'pause' | 'resume',
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
