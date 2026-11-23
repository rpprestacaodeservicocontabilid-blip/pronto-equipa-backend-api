import { Request, Response } from 'express';
import { ManageLegalRulesUseCase } from '../../application/use-cases/manage-legal-rules.use-case';
import { LegalRulesRepositoryPort } from '../../application/ports/legal-rules.repository.port';
import { compareLegalImpact, legalImpactSchema } from '../../application/use-cases/compare-legal-impact';
import { LegalSourceInput } from '../../domain/legal-governance';
import { CreateLegalRuleSetBody, UpdateLegalRuleSetBody } from '../schemas/legal-rules.schema';

export class LegalRulesController {
  constructor(private readonly useCase: ManageLegalRulesUseCase) {}

  async list(req: Request, res: Response) {
    const data = await this.useCase.query((repository) => repository.list(req.query as never));
    res.status(200).json({ success: true, data });
  }

  async sources(req: Request, res: Response) {
    const query = req.query as unknown as {page: number; limit: number};
    const data = await this.useCase.query(repository => repository.listSources(query.page, query.limit));
    res.status(200).json({ success: true, data });
  }

  async registerSource(req: Request, res: Response) {
    const actorId = this.actorId(req);
    const data = await this.useCase.execute(actorId, 'source-registered',
      repository => repository.registerSource(req.body as LegalSourceInput, actorId), 'legal_source');
    res.status(201).json({ success: true, data });
  }

  async impact(req: Request, res: Response) {
    const data = await this.useCase.query(repository => compareLegalImpact(repository, legalImpactSchema.parse(req.body)));
    res.set('Cache-Control', 'no-store').status(200).json({ success: true, data });
  }

  async reject(req: Request, res: Response) {
    await this.transition(req, res, 'rejected', (repository, actorId) =>
      repository.reject(req.params.id, actorId, req.body.reason, req.body.expectedUpdatedAt),
    );
  }

  async get(req: Request, res: Response) {
    const data = await this.useCase.query((repository) => repository.getView(req.params.id));
    res.status(200).json({ success: true, data });
  }

  async create(req: Request, res: Response) {
    const actorId = this.actorId(req);
    const data = await this.useCase.execute(actorId, 'created', (repository) =>
      repository.create(req.body as CreateLegalRuleSetBody, actorId),
    );
    res.status(201).json({ success: true, data });
  }

  async update(req: Request, res: Response) {
    const actorId = this.actorId(req);
    const data = await this.useCase.execute(actorId, 'updated', (repository) =>
      repository.update(req.params.id, req.body as UpdateLegalRuleSetBody, actorId),
    );
    res.status(200).json({ success: true, data });
  }

  async submit(req: Request, res: Response) {
    await this.transition(req, res, 'submitted', (repository, actorId) =>
      repository.submit(req.params.id, actorId, req.body?.expectedUpdatedAt),
    );
  }
  async approve(req: Request, res: Response) {
    await this.transition(req, res, 'approved', (repository, actorId) =>
      repository.approve(req.params.id, actorId, req.body?.expectedUpdatedAt),
    );
  }
  async publish(req: Request, res: Response) {
    await this.transition(req, res, 'published', (repository, actorId) =>
      repository.publish(req.params.id, actorId, req.body?.expectedUpdatedAt),
    );
  }
  async retire(req: Request, res: Response) {
    await this.transition(req, res, 'retired', (repository, actorId) =>
      repository.retire(req.params.id, actorId, req.body?.expectedUpdatedAt),
    );
  }

  async resolve(req: Request, res: Response) {
    const body = req.body as { companyId: number; startDate: string; endDate: string };
    const data = await this.useCase.query((repository) =>
      repository.resolve(body.companyId, body.startDate, body.endDate),
    );
    res.status(200).json(data);
  }

  private async transition(
    req: Request,
    res: Response,
    action: string,
    operation: (repository: LegalRulesRepositoryPort, actorId: number) => Promise<unknown>,
  ) {
    const actorId = this.actorId(req);
    const data = await this.useCase.execute(actorId, action, (repository) =>
      operation(repository, actorId),
    );
    res.status(200).json({ success: true, data });
  }

  private actorId(req: Request) {
    if (!req.user?.userId) throw new Error('Authenticated platform actor is missing.');
    return req.user.userId;
  }
}
