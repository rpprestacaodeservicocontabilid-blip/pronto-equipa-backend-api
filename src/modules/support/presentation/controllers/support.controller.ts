import {
  supportTicketSchema,
  supportUpdateTicketSchema,
  supportAssignmentSchema,
  supportTransferSchema,
  supportPrioritySchema,
  supportTransitionSchema,
  supportMessageSchema,
  supportPolicySchema,
  supportResourceSchema,
  supportIncidentSchema,
  supportIncidentPatchSchema,
  supportIncidentLinkSchema,
  supportEscalationSchema,
  supportArticleSchema,
  supportArticlePatchSchema,
  supportRatingSchema,
} from '../schemas/support.schema';
import { Request, Response } from 'express';
import type { SupportTicketStatus } from '../../domain/support-ticket';
import { SupportApplicationService } from '../../application/use-cases/support-application.service';

export class SupportController {
  constructor(
    private readonly service: SupportApplicationService,
    private readonly resolveCompany = (req: Request) => req.tenant?.companyId,
    private readonly platform = false,
    private readonly verifyAgent?: (agent: number) => Promise<boolean>,
  ) {}

  async createTicket(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.status(201).json({
      success: true,
      data: await this.service.createTicket(companyId, actor, supportTicketSchema.parse(req.body)),
    });
  }

  async listTickets(req: Request, res: Response, ownOnly: boolean) {
    const { companyId, actor } = this.context(req);
    res.json({
      success: true,
      ...(await this.service.listTickets(companyId, actor, {
        ownOnly, platform: this.platform,
        type: typeof req.query.type === 'string' ? req.query.type : undefined,
        queue: typeof req.query.queue === 'string' ? req.query.queue : undefined,
        page: Number(req.query.page || 1),
        limit: Number(req.query.limit || 20),
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        priority: typeof req.query.priority === 'string' ? req.query.priority : undefined,
      })),
    });
  }

  async getTicket(req: Request, res: Response, agent = false) {
    const { companyId, actor } = this.context(req);
    res.json({
      success: true,
      data: await this.service.getTicket(companyId, actor, req.params.id, agent, false, this.platform),
    });
  }

  async updateTicket(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.json({
      success: true,
      data: await this.service.updateTicket(
        companyId,
        actor,
        req.params.id,
        supportUpdateTicketSchema.parse(req.body),
      ),
    });
  }

  async assignTicket(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.json({
      success: true,
      data: await this.service.assignTicket(
        companyId,
        actor,
        req.params.id,
        supportAssignmentSchema.parse(req.body),
        this.platform,
        this.verifyAgent,
      ),
    });
  }

  async transferTicket(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.json({
      success: true,
      data: await this.service.transferTicket(
        companyId,
        actor,
        req.params.id,
        supportTransferSchema.parse(req.body).teamId,
        this.platform,
      ),
    });
  }

  async changePriority(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.json({
      success: true,
      data: await this.service.changePriority(
        companyId,
        actor,
        req.params.id,
        supportPrioritySchema.parse(req.body).priority,
      ),
    });
  }

  async transition(
    req: Request,
    res: Response,
    status?: SupportTicketStatus,
  ) {
    const { companyId, actor } = this.context(req);
    res.json({
      success: true,
      data: await this.service.transition(
        companyId,
        actor,
        req.params.id,
        status ?? (req.body.status as SupportTicketStatus),
        supportTransitionSchema.parse(req.body).resolution,
      ),
    });
  }

  async messages(req: Request, res: Response, agent: boolean) {
    const { companyId, actor } = this.context(req);
    if (req.method === 'GET') {
      const ticket = await this.service.getTicket(companyId, actor, req.params.id, agent, agent, this.platform);
      res.json({ success: true, data: ticket.messages });
      return;
    }
    res.status(201).json({
      success: true,
      data: await this.service.addMessage(
        companyId,
        actor,
        req.params.id,
        supportMessageSchema.parse(req.body),
        agent,
        this.platform,
      ),
    });
  }

  async history(req: Request, res: Response, agent: boolean) {
    const { companyId, actor } = this.context(req);
    res.json({
      success: true,
      data: await this.service.historyForTicket(companyId, actor, req.params.id, agent, this.platform, false),
    });
  }

  async sla(req: Request, res: Response, agent: boolean) {
    const { companyId, actor } = this.context(req);
    res.json({
      success: true,
      data: await this.service.slaForTicket(companyId, actor, req.params.id, agent),
    });
  }

  async createPolicy(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.status(201).json({
      success: true,
      data: await this.service.createPolicy(companyId, actor, supportPolicySchema.parse(req.body), this.platform),
    });
  }

  async listPolicies(req: Request, res: Response) {
    const { companyId } = this.context(req);
    res.json({ success: true, data: await this.service.listPolicies(companyId, this.platform) });
  }

  async createResource(req: Request, res: Response, kind: string) {
    const { companyId, actor } = this.context(req);
    res.status(201).json({
      success: true,
      data: await this.service.createResource(
        companyId,
        actor,
        kind,
        { ...supportResourceSchema.parse(req.body), workspace: this.platform ? 'PLATFORM' : 'COMPANY' },
      ),
    });
  }

  async listResource(req: Request, res: Response, kind: string) {
    const { companyId } = this.context(req);
    res.json({ success: true, data: await this.service.listKind(companyId, kind, this.platform) });
  }

  async monitorSla(req: Request, res: Response) {
    const { companyId } = this.context(req);
    const result = await this.service.slaSnapshot(companyId, this.platform);
    res.json({
      success: true,
      data: req.path.endsWith('/breaches') ? result.breached : result.atRisk,
    });
  }

  async createIncident(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.status(201).json({
      success: true,
      data: await this.service.createIncident(companyId, actor, { ...supportIncidentSchema.parse(req.body), workspace: this.platform ? 'PLATFORM' : 'COMPANY' }),
    });
  }

  async updateIncident(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.json({
      success: true,
      data: await this.service.updateIncident(
        companyId,
        actor,
        req.params.id,
        supportIncidentPatchSchema.parse(req.body),
        this.platform,
      ),
    });
  }

  async linkIncident(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.json({
      success: true,
      data: await this.service.linkTicketIncident(
        companyId,
        actor,
        req.params.id,
        supportIncidentLinkSchema.parse(req.body).incidentId,
        this.platform,
      ),
    });
  }

  async escalateTicket(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.status(201).json({
      success: true,
      data: await this.service.escalateTicket(
        companyId,
        actor,
        req.params.id,
        supportEscalationSchema.parse(req.body).reason,
      ),
    });
  }

  async createArticle(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.status(201).json({
      success: true,
      data: await this.service.createArticle(
        companyId,
        actor,
        { ...supportArticleSchema.parse(req.body), workspace: this.platform ? 'PLATFORM' : 'COMPANY' },
      ),
    });
  }

  async updateArticle(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.json({
      success: true,
      data: await this.service.updateArticle(
        companyId,
        actor,
        req.params.id,
        supportArticlePatchSchema.parse(req.body),
        this.platform,
      ),
    });
  }

  async publishArticle(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.json({
      success: true,
      data: await this.service.publishArticle(companyId, actor, req.params.id, this.platform),
    });
  }

  async searchArticles(req: Request, res: Response, internal = false) {
    const { companyId } = this.context(req);
    res.json({
      success: true,
      data: await this.service.searchArticles(companyId, String(req.query.q || '').slice(0, 200), internal, this.platform, this.platform),
    });
  }

  async rate(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.status(201).json({
      success: true,
      data: await this.service.rateTicket(
        companyId,
        actor,
        req.params.id,
        supportRatingSchema.parse(req.body).rating,
        supportRatingSchema.parse(req.body).comment,
      ),
    });
  }

  async dashboard(req: Request, res: Response) {
    const { companyId } = this.context(req);
    res.json({ success: true, data: await this.service.dashboard(companyId, this.platform) });
  }

  async audit(req: Request, res: Response) {
    const { companyId } = this.context(req);
    res.json({ success: true, data: await this.service.auditEntries(companyId, this.platform) });
  }

  async completeEscalation(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.json({ success: true, data: await this.service.completeEscalation(companyId, actor, req.params.id, req.body.resolution, this.platform) });
  }

  async updateAgent(req: Request, res: Response) {
    const { companyId, actor } = this.context(req);
    res.json({ success: true, data: await this.service.updateAgent(companyId, actor, req.params.id, req.body.status, this.platform) });
  }

  private context(req: Request) {
    const companyId = this.resolveCompany(req);
    const actor = req.user?.userId;
    if (!companyId || !actor)
      throw Object.assign(new Error('Contexto de empresa ou utilizador indisponível.'), {
        statusCode: 401,
      });
    return { companyId, actor };
  }
}
