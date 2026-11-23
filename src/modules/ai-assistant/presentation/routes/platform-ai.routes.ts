import { Request, RequestHandler, Router } from 'express';
import { z } from 'zod';
import type { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { PlatformAiAdministration } from '../../application/use-cases/platform-ai-administration';
import { aiCompanies, aiCosts, aiDashboard, AiPlatformList, listAiPlatform, platformAiLists } from '../../infrastructure/platform-ai-reads';

const page = z.coerce.number().int().min(1).max(10000).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(25);
const companyId = z.coerce.number().int().min(1).max(2147483647);
const period = z.string().regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/);
const currentPeriod = () => new Date(Date.now() + 3600000).toISOString().slice(0, 7);
const provider = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z][A-Za-z0-9_-]*$/), name: z.string().trim().min(2).max(120),
  status: z.enum(['ACTIVE', 'DISABLED']), timeoutMs: z.number().int().min(1000).max(120000),
  priority: z.number().int().min(0).max(1000),
}).strict();
const model = z.object({
  providerId: z.string().uuid(), modelCode: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(2).max(120), status: z.enum(['ACTIVE', 'DISABLED', 'FALLBACK']),
  isDefault: z.boolean(), temperature: z.number().min(0).max(2).nullable(),
  maxOutputTokens: z.number().int().min(1).max(1000000).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/), inputPricePerMillion: z.number().min(0).max(1000000),
  outputPricePerMillion: z.number().min(0).max(1000000),
}).strict();
const prompt = z.object({
  templateCode: z.string().trim().min(2).max(60).regex(/^[A-Z][A-Z0-9_-]*$/),
  content: z.string().trim().min(10).max(32000),
}).strict();
const id = (req: Request) => z.string().uuid().parse(req.params.id);
const actor = (req: Request) => Number(req.user!.userId);

export function createPlatformAiRoutes(audit: AuditRecorderPort) {
  const service = new PlatformAiAdministration(audit);
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const handle = (execute: (req: Request) => unknown | Promise<unknown>): RequestHandler => async (req, res, next) => {
    try { res.json({ success: true, data: await execute(req) }); }
    catch (error) { next(error); }
  };

  router.get('/dashboard', handle(req => {
    const scope = z.object({ companyId: companyId.optional(), period: period.optional() }).strict().parse(req.query);
    return aiDashboard(scope.companyId, scope.period ?? currentPeriod());
  }));
  router.get('/companies', handle(req => {
    const options = z.object({ page, limit, search: z.string().trim().max(100).default('') }).strict().parse(req.query);
    return aiCompanies(options.search, options.page, options.limit);
  }));
  router.get('/costs', handle(req => {
    const options = z.object({ companyId, page, limit, period: period.optional() }).strict().parse(req.query);
    return aiCosts(options.companyId, options.period ?? currentPeriod(), options.page, options.limit);
  }));
  for (const [path, definition] of Object.entries(platformAiLists)) {
    router.get('/' + path, handle(req => {
      const scope = 'scope' in definition ? definition.scope : undefined;
      const monthly = 'month' in definition;
      const options = z.object({
        page, limit,
        companyId: scope === 'company' ? companyId : scope === 'shared' ? companyId.optional() : z.undefined(),
        period: monthly ? period.optional() : z.undefined(),
      }).strict().parse(req.query);
      return listAiPlatform(path as AiPlatformList, { ...options, period: monthly ? options.period ?? currentPeriod() : undefined });
    }));
  }

  router.post('/providers', handle(req => service.saveProvider(actor(req), provider.parse(req.body))));
  router.patch('/providers/:id', handle(req => service.saveProvider(actor(req), provider.parse(req.body), id(req))));
  router.post('/models', handle(req => service.saveModel(actor(req), model.parse(req.body))));
  router.patch('/models/:id', handle(req => service.saveModel(actor(req), model.parse(req.body), id(req))));
  router.get('/prompts/:id', handle(req => service.prompt(id(req))));
  router.post('/prompts', handle(req => service.createPrompt(actor(req), prompt.parse(req.body))));
  router.post('/prompts/:id/publish', handle(req => service.publishPrompt(actor(req), id(req))));
  router.post('/evaluations', handle(req => service.createEvaluation(actor(req), z.object({
    code: z.string().trim().min(2).max(60).regex(/^[A-Z][A-Z0-9_-]*$/),
    cases: z.array(z.object({
      name: z.string().trim().min(2).max(200),
      expectedBehaviour: z.string().trim().min(5).max(1000),
    }).strict()).min(1).max(50),
  }).strict().parse(req.body))));
  router.patch('/safety-incidents/:id', handle(req => {
    const scope = z.object({ companyId }).strict().parse(req.query);
    const input = z.object({
      expected: z.enum(['OPEN', 'ACKNOWLEDGED']),
      status: z.enum(['ACKNOWLEDGED', 'RESOLVED', 'DISMISSED']),
      reason: z.string().trim().min(5).max(300),
    }).strict().parse(req.body);
    return service.updateIncident(actor(req), scope.companyId, id(req), input);
  }));
  router.post('/tools/sync', handle(req => service.syncTools(actor(req))));
  router.post('/tools/:id/disable', handle(req => {
    const { reason } = z.object({ reason: z.string().trim().min(5).max(300) }).strict().parse(req.body);
    return service.disableTool(actor(req), id(req), reason);
  }));
  return router;
}
