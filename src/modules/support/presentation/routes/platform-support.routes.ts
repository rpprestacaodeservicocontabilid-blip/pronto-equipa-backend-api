import { Request, RequestHandler, Router } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { ForbiddenError } from '../../../../shared/errors/app.error';
import type { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import type { SupportApplicationService } from '../../application/use-cases/support-application.service';
import { createSupportRoutes } from './support.routes';
import { supportArticlePatchSchema, supportArticleSchema, supportIncidentPatchSchema, supportIncidentSchema } from '../schemas/support.schema';

export interface PlatformSupportOptions {
  authorize: (actor: number, permission: string) => Promise<boolean>;
  audit: AuditRecorderPort;
}

export function createPlatformSupportRoutes(service: SupportApplicationService, options: PlatformSupportOptions) {
  const router = Router();
  const companies = new WeakMap<Request, number>();
  const requirePlatform = (permission: string): RequestHandler => async (req, _res, next) => {
    try {
      const actor = req.user?.userId;
      if (!actor || !await options.authorize(actor, 'platform:' + permission)) throw new ForbiddenError('Support access denied.');
      const companyId = companies.get(req);
      if (companyId !== undefined) await options.audit.record({
        companyId, actorUserId: actor, action: 'support.platform.access',
        entityType: 'support_company', entityId: companyId,
        after: { permission, method: req.method, path: req.path },
      });
      next();
    } catch (error) { next(error); }
  };

  router.use(requirePlatform('support:access'), (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/companies', async (req, res, next) => {
    try {
      const { search, page, limit } = z.object({
        search: z.string().trim().max(100).default(''),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(15),
      }).strict().parse(req.query);
      const text = search.replace(/[\\%_]/g, '');
      const clause = !text ? {} : /^\d{1,9}$/.test(text) ? { id: Number(text) } : { name: { [Op.like]: '%' + text + '%' } };
      const result = await CompanyModel.findAndCountAll({
        where: { ...clause, status: 'ACTIVE' }, attributes: ['id', 'name'],
        order: [['name', 'ASC'], ['id', 'ASC']], offset: (page - 1) * limit, limit,
      });
      res.json({ success: true, data: result.rows, page, limit, total: result.count });
    } catch (error) { next(error); }
  });

  const resolveCompany: RequestHandler = async (req, _res, next) => {
    try {
      const id = z.coerce.number().int().min(1).max(2147483647).safeParse(req.params.companyId);
      if (!id.success || !await CompanyModel.findOne({ where: { id: id.data, status: 'ACTIVE' }, attributes: ['id'] }))
        throw new ForbiddenError('Support company unavailable.');
      companies.set(req, id.data);
      next();
    } catch (error) { next(error); }
  };
  const guardTicket = async (req: Request) => {
    await service.assertPlatformTicket(companies.get(req)!, req.params.id);
    if (Array.isArray(req.body?.attachmentIds) && req.body.attachmentIds.length)
      throw new ForbiddenError('Platform support replies require document authorization.');
  };

  const verifyAgent = async (agent: number) => await options.authorize(agent, 'platform:support:access') &&
    options.authorize(agent, 'platform:support:tickets:read-team');
  router.use('/companies/:companyId', resolveCompany,
    createSupportRoutes(service, requirePlatform, {
      company: req => companies.get(req), platform: true, guardTicket, verifyAgent,
    }).admin);
  const run = (handler: (req: Request) => Promise<unknown>): RequestHandler => async (req, res, next) => {
    try { res.json({ success: true, data: await handler(req) }); }
    catch (error) { next(error); }
  };
  const actor = (req: Request) => req.user!.userId;
  const key = (req: Request) => z.string().uuid().parse(req.params.id);
  router.get('/incidents', requirePlatform('support:incidents:read'), run(() => service.listKind(null, 'INCIDENT')));
  router.post('/incidents', requirePlatform('support:incidents:create'), run(req =>
    service.createIncident(null, actor(req), supportIncidentSchema.parse(req.body))));
  router.patch('/incidents/:id', requirePlatform('support:incidents:manage'), run(req =>
    service.updateIncident(null, actor(req), key(req), supportIncidentPatchSchema.parse(req.body))));
  router.get('/knowledge/articles', requirePlatform('support:knowledge:read'), run(req =>
    service.searchArticles(null, String(req.query.q || '').slice(0, 200), true, true, true)));
  router.post('/knowledge/articles', requirePlatform('support:knowledge:create'), run(req =>
    service.createArticle(null, actor(req), supportArticleSchema.parse(req.body))));
  router.patch('/knowledge/articles/:id', requirePlatform('support:knowledge:update'), run(req =>
    service.updateArticle(null, actor(req), key(req), supportArticlePatchSchema.parse(req.body), true)));
  router.post('/knowledge/articles/:id/publish', requirePlatform('support:knowledge:publish'), run(req =>
    service.publishArticle(null, actor(req), key(req))));
  return router;
}
