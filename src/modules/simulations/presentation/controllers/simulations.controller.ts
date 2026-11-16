import { Request, Response } from 'express';
import { SimulationsApplicationService } from '../../application/use-cases/simulations-application.service';
import {
  comparePayrollSchema,
  compareSchema,
  createScenarioSchema,
  decisionSchema,
  exportSchema,
  projectionSchema,
  proposalSchema,
  runListSchema,
  runScenarioSchema,
  scenarioListSchema,
  updateScenarioSchema,
} from '../schemas/simulations.schema';
export class SimulationsController {
  constructor(private readonly simulations: SimulationsApplicationService) {}
  async scenarios(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    if (req.method === 'POST') {
      res.status(201).json({
        success: true,
        data: await this.simulations.createScenario(
          c.companyId,
          c.actorUserId,
          createScenarioSchema.parse(req.body),
        ),
      });
      return;
    }
    res.json({
      success: true,
      data: await this.simulations.listScenarios(c.companyId, scenarioListSchema.parse(req.query)),
    });
  }
  async scenario(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    if (req.method === 'PATCH') {
      res.json({
        success: true,
        data: await this.simulations.updateScenario(
          c.companyId,
          c.actorUserId,
          req.params.id,
          updateScenarioSchema.parse(req.body),
        ),
      });
      return;
    }
    res.json({
      success: true,
      data: await this.simulations.getScenario(c.companyId, req.params.id),
    });
  }
  async duplicate(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(201).json({
      success: true,
      data: await this.simulations.duplicateScenario(
        c.companyId,
        c.actorUserId,
        req.params.id,
        req.body?.name,
      ),
    });
  }
  async archive(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.simulations.archiveScenario(c.companyId, c.actorUserId, req.params.id),
    });
  }
  async versions(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.simulations.scenarioVersions(c.companyId, req.params.id),
    });
  }
  async execute(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const result = await this.simulations.executeScenario(
      c.companyId,
      c.actorUserId,
      req.params.id,
      runScenarioSchema.parse(req.body),
    );
    res.status(result.queued ? 202 : 201).json({ success: true, data: result });
  }
  async runs(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.simulations.listRuns(c.companyId, runListSchema.parse(req.query)),
    });
  }
  async run(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({ success: true, data: await this.simulations.getRun(c.companyId, req.params.id) });
  }
  async progress(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.simulations.runProgress(c.companyId, req.params.id),
    });
  }
  async results(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.simulations.runResults(c.companyId, req.params.id),
    });
  }
  async retry(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.simulations.retryFailed(c.companyId, c.actorUserId, req.params.id),
    });
  }
  async cancel(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.simulations.cancelRun(c.companyId, c.actorUserId, req.params.id),
    });
  }
  async explanation(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.simulations.explanation(c.companyId, req.params.id, req.params.employeeId),
    });
  }
  async compare(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(201).json({
      success: true,
      data: await this.simulations.compareRuns(
        c.companyId,
        c.actorUserId,
        compareSchema.parse(req.body),
      ),
    });
  }
  async comparePayroll(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(201).json({
      success: true,
      data: await this.simulations.comparePayroll(
        c.companyId,
        c.actorUserId,
        comparePayrollSchema.parse(req.body),
      ),
    });
  }
  async projections(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    if (req.method === 'GET') {
      res.json({
        success: true,
        data: await this.simulations.getProjections(c.companyId, req.params.id),
      });
      return;
    }
    res.status(201).json({
      success: true,
      data: await this.simulations.project(
        c.companyId,
        c.actorUserId,
        req.params.id,
        projectionSchema.parse(req.body),
      ),
    });
  }
  async proposals(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    if (req.method === 'POST') {
      res.status(201).json({
        success: true,
        data: await this.simulations.submitProposal(
          c.companyId,
          c.actorUserId,
          req.params.id,
          proposalSchema.parse(req.body),
        ),
      });
      return;
    }
    res.json({ success: true, data: await this.simulations.listProposals(c.companyId) });
  }
  async proposal(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({ success: true, data: await this.simulations.proposal(c.companyId, req.params.id) });
  }
  async decide(
    req: Request,
    res: Response,
    decision: 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED',
  ) {
    const c = this.context(req, res);
    if (!c) return;
    const input = decisionSchema.parse(req.body);
    res.json({
      success: true,
      data: await this.simulations.decideProposal(
        c.companyId,
        c.actorUserId,
        req.params.id,
        decision,
        input.reason,
      ),
    });
  }
  async export(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(201).json({
      success: true,
      data: await this.simulations.exportRun(
        c.companyId,
        c.actorUserId,
        req.params.id,
        exportSchema.parse(req.body).format,
      ),
    });
  }
  async download(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const file = await this.simulations.downloadExport(c.companyId, c.actorUserId, req.params.id);
    const mime =
      file.format === 'PDF'
        ? 'application/pdf'
        : file.format === 'XLSX'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv; charset=utf-8';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.content);
  }
  private context(req: Request, res: Response) {
    const companyId = res.req.tenant?.companyId,
      actorUserId = req.user?.userId;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company context is required.' });
      return null;
    }
    if (!actorUserId) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return null;
    }
    return { companyId, actorUserId };
  }
}
