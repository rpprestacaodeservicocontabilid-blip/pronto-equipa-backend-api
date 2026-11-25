import { z } from 'zod';
import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { ReportsController } from '../controllers/reports.controller';
import { REPORT_PERMISSION, REPORT_CATALOG, requiresSalaryAccess, WORKSPACE_REPORT_FILTERS } from '../../domain/report-catalog';
import { ReportsApplicationService } from '../../application/use-cases/reports-application.service';
import { idSchema } from '../schemas/reports.schema';
const historyLimit = z.coerce.number().int().min(1).max(100);

type RequirePermission = (
  permission: string,
) => (req: Request, res: Response, next: NextFunction) => void;
const validateId = (req: Request, res: Response, next: NextFunction) => {
  const parsed = idSchema.safeParse(req.params.id);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Invalid id.' });
    return;
  }
  next();
};
const endpoint = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void fn(req, res).catch(next); };
export const createReportsRoutes = (
  controller: ReportsController,
  service: ReportsApplicationService,
  requirePermission: RequirePermission,
) => {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  const checkCode =
    (param: 'body' | 'param') => (req: Request, res: Response, next: NextFunction) => {
      const code =
        param === 'body'
          ? z.object({ code: z.string() }).parse(req.body).code
          : String(req.params.code || '');
      const def = REPORT_CATALOG.find((item) => item.code === code);
      if (!def) {
        res.status(404).json({ success: false, message: 'Relatório não encontrado.' });
        return;
      }
      const middleware = requirePermission(REPORT_PERMISSION[def.domain]);
      middleware(req, res, (error?: unknown) => {
        if (error) {
          next(error);
          return;
        }
        if (requiresSalaryAccess(def)) {
          requirePermission('reports:salary:read-sensitive')(req, res, next);
        } else next();
      });
    };
  router.get(
    '/catalog',
    requirePermission('reports:catalog:read'),
    endpoint(controller.catalog.bind(controller)),
  );
  router.get(
    '/catalog/:code',
    requirePermission('reports:catalog:read'),
    checkCode('param'),
    (req, res) => res.json({ success: true, data: {
      ...service.definition(req.params.code),
      workspaceFilters: WORKSPACE_REPORT_FILTERS[req.params.code],
      fields: service.customFields(req.params.code),
    } }),
  );
  router.post(
    '/executions',
    requirePermission('reports:execute'),
    checkCode('body'),
    endpoint(controller.execute.bind(controller)),
  );
  router.get(
    '/executions',
    requirePermission('reports:executions:read'),
    (req, _res, next) => { if (req.query.limit !== undefined) historyLimit.parse(req.query.limit); next(); },
    endpoint(controller.executions.bind(controller)),
  );
  router.get(
    '/executions/:id',
    requirePermission('reports:executions:read'),
    validateId,
    endpoint(controller.execution.bind(controller)),
  );
  router.post(
    '/executions/:id/exports',
    requirePermission('reports:exports:create'),
    validateId,
    endpoint(controller.exportExecution.bind(controller)),
  );
  router.get(
    '/exports',
    requirePermission('reports:exports:download'),
    endpoint(controller.exports.bind(controller)),
  );
  router.post(
    '/exports',
    requirePermission('reports:exports:create'),
    checkCode('body'),
    endpoint(controller.export.bind(controller)),
  );
  router.get(
    '/exports/:id/download',
    requirePermission('reports:exports:download'),
    validateId,
    endpoint(controller.download.bind(controller)),
  );
  router.get(
    '/dashboard',
    requirePermission('reports:dashboard:read'),
    requirePermission('reports:kpis:read'),
    endpoint(controller.dashboard.bind(controller)),
  );
  router.get(
    '/custom',
    requirePermission('reports:catalog:read'),
    endpoint(controller.customReports.bind(controller)),
  );
  router.post(
    '/custom/:id/preview',
    requirePermission('reports:execute'),
    validateId,
    endpoint(controller.previewCustomReport.bind(controller)),
  );
  router.post(
    '/custom',
    requirePermission('reports:custom:create'),
    checkCode('body'),
    endpoint(controller.customReports.bind(controller)),
  );
  router.post(
    '/custom/:id/publish',
    requirePermission('reports:custom:publish'),
    validateId,
    endpoint(controller.publishCustomReport.bind(controller)),
  );
  router.get(
    '/schedules',
    requirePermission('reports:history:read'),
    endpoint(controller.schedules.bind(controller)),
  );
  router.post(
    '/schedules',
    requirePermission('reports:schedules:create'),
    checkCode('body'),
    endpoint(controller.schedules.bind(controller)),
  );
  router.post(
    '/schedules/:id/:action(pause|resume)',
    requirePermission('reports:schedules:update'),
    validateId,
    endpoint(controller.scheduleAction.bind(controller)),
  );
  return router;
};
