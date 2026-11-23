import { Request, RequestHandler, Router } from 'express';
import { z } from 'zod';
import { cadences, formats, groupings, reportCodes } from '../../domain/platform-report-catalog';
import { PlatformReportsService } from '../../application/use-cases/platform-reports.service';
import { PlatformReportObservations } from '../../infrastructure/platform-report-observations';

const companyId = z.number().int().min(1).max(2147483647);
const scope = z.object({ from: z.string().date(), to: z.string().date(), companyId: companyId.optional(), grouping: z.enum(groupings) }).strict();
const input = z.object({ code: z.enum(reportCodes), scope }).strict();
const params = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const id = (req: Request) => z.string().uuid().parse(req.params.id);
const actor = (req: Request) => Number(req.user!.userId);
const title = z.string().trim().min(2).max(100);
const schedule = z.object({
  title, code: z.enum(reportCodes), cadence: z.enum(cadences), grouping: z.enum(groupings), companyId: companyId.optional(),
}).strict();
const mime = { CSV: 'text/csv; charset=utf-8', PDF: 'application/pdf', XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

export function createPlatformReportsRoutes(service: PlatformReportsService, sources: PlatformReportObservations) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const handle = (run: (req: Request) => unknown | Promise<unknown>): RequestHandler => async (req, res, next) => {
    try { res.json({ success: true, data: await run(req) }); }
    catch (error) { next(error); }
  };

  router.get('/catalog', handle(() => service.catalogue()));
  router.get('/companies', handle(req => {
    const options = params.extend({ search: z.string().trim().min(1).max(100).optional() }).strict().parse(req.query);
    return sources.companies(options.search, options);
  }));
  router.post('/preview', handle(req => {
    const { compare, ...request } = input.extend({ compare: z.boolean().default(false) }).parse(req.body);
    return service.preview(request, compare);
  }));

  for (const [path, kind] of [['executions', 'EXECUTION'], ['exports', 'EXPORT'], ['templates', 'TEMPLATE'], ['schedules', 'SCHEDULE']] as const) {
    router.get('/' + path, handle(req => {
      const { page, limit } = params.strict().parse(req.query);
      return service.list(actor(req), kind, page, limit);
    }));
  }
  router.post('/executions', handle(req => {
    const { operationKey, ...request } = input.extend({ operationKey: z.string().uuid() }).parse(req.body);
    return service.run(actor(req), request, operationKey);
  }));
  router.get('/executions/:id', handle(req => service.execution(actor(req), id(req))));
  router.post('/executions/:id/retry', handle(req => service.retry(actor(req), id(req))));
  router.post('/executions/:id/exports', handle(req => {
    const { format } = z.object({ format: z.enum(formats) }).strict().parse(req.body);
    return service.makeExport(actor(req), id(req), format);
  }));
  router.get('/exports/:id/download', async (req, res, next) => {
    try {
      const document = await service.download(actor(req), id(req));
      res.set('X-Content-Type-Options', 'nosniff');
      res.attachment(document.filename).type(mime[document.format]).send(document.bytes);
    } catch (error) { next(error); }
  });
  router.post('/templates', handle(req => service.saveTemplate(actor(req), input.extend({
    title, previousId: z.string().uuid().optional(),
  }).parse(req.body))));
  router.post('/schedules', handle(req => service.createSchedule(actor(req), schedule.parse(req.body))));
  router.patch('/schedules/:id', handle(req => service.editSchedule(actor(req), id(req), schedule.parse(req.body))));
  router.post('/schedules/:id/status', handle(req => service.changeSchedule(actor(req), id(req),
    z.object({ status: z.enum(['ACTIVE', 'PAUSED']) }).strict().parse(req.body).status,
  )));
  router.get('/audit', handle(req => {
    const { page, limit } = params.strict().parse(req.query);
    return sources.audit(actor(req), page, limit);
  }));
  router.get('/policy', handle(() => service.policy()));
  router.post('/policy', handle(req => {
    const { expected, reason, ...policy } = z.object({
      expected: z.number().int().positive(), reason: z.string().trim().min(3).max(1000),
      maxDays: z.number().int().min(31).max(366), exportHours: z.number().int().min(1).max(168),
    }).strict().parse(req.body);
    return service.publishPolicy(actor(req), expected, policy, reason);
  }));
  router.use((_req, res) => { res.status(404).json({ success: false, message: 'Platform report route not found.' }); });
  return router;
}

