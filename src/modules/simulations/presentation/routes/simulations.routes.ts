import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { SimulationsApplicationService } from '../../application/use-cases/simulations-application.service';
import { SIMULATION_PERMISSIONS } from '../../domain/simulation.types';
import { SimulationsController } from '../controllers/simulations.controller';
import { idSchema, runScenarioSchema } from '../schemas/simulations.schema';
const endpoint = (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void handler(req, res).catch(next); };
type RequirePermission = (
  permission: string,
) => (req: Request, res: Response, next: NextFunction) => void;
const validateId = (req: Request, res: Response, next: NextFunction) => {
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(400).json({ success: false, message: 'Identificador inválido.' });
    return;
  }
  next();
};
export const createSimulationsRoutes = (
  controller: SimulationsController,
  service: SimulationsApplicationService,
  requirePermission: RequirePermission,
) => {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  const executeScope = (req: Request, res: Response, next: NextFunction) => {
    void service
      .getScenario(Number(res.req.tenant?.companyId), req.params.id)
      .then((scenario) => {
        const input = runScenarioSchema.parse(req.body);
        if (input.version !== undefined && input.version !== scenario.version) {
          res.status(409).json({ success: false, message: 'A versão solicitada já não é a versão actual do cenário.' });
          return;
        }
        req.body = { ...input, version: scenario.version };
        const ids = input.employeeIds ?? scenario.configuration?.employeeIds;
        const bulk = scenario.type === 'BULK_PAYROLL' || ids?.length !== 1;
        requirePermission(bulk ? SIMULATION_PERMISSIONS.bulk : SIMULATION_PERMISSIONS.individual)(
          req,
          res,
          next,
        );
      })
      .catch(next);
  };
  router.get(
    '/scenarios',
    requirePermission(SIMULATION_PERMISSIONS.read),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    endpoint(controller.scenarios.bind(controller)),
  );
  router.post(
    '/scenarios',
    requirePermission(SIMULATION_PERMISSIONS.create),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    endpoint(controller.scenarios.bind(controller)),
  );
  router.get(
    '/scenarios/:id',
    requirePermission(SIMULATION_PERMISSIONS.read),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.scenario.bind(controller)),
  );
  router.patch(
    '/scenarios/:id',
    requirePermission(SIMULATION_PERMISSIONS.update),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.scenario.bind(controller)),
  );
  router.post(
    '/scenarios/:id/duplicate',
    requirePermission(SIMULATION_PERMISSIONS.duplicate),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.duplicate.bind(controller)),
  );
  router.post(
    '/scenarios/:id/versions',
    requirePermission(SIMULATION_PERMISSIONS.update),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.scenario.bind(controller)),
  );
  router.post(
    '/scenarios/:id/archive',
    requirePermission(SIMULATION_PERMISSIONS.archive),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.archive.bind(controller)),
  );
  router.get(
    '/scenarios/:id/versions',
    requirePermission(SIMULATION_PERMISSIONS.history),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.versions.bind(controller)),
  );
  router.post(
    '/scenarios/:id/runs',
    requirePermission(SIMULATION_PERMISSIONS.execute),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    executeScope,
    endpoint(controller.execute.bind(controller)),
  );

  router.get(
    '/runs',
    requirePermission(SIMULATION_PERMISSIONS.runRead),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    endpoint(controller.runs.bind(controller)),
  );
  router.get(
    '/runs/:id',
    requirePermission(SIMULATION_PERMISSIONS.runRead),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.run.bind(controller)),
  );
  router.get(
    '/runs/:id/results',
    requirePermission(SIMULATION_PERMISSIONS.runRead),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.results.bind(controller)),
  );
  router.get(
    '/runs/:id/progress',
    requirePermission(SIMULATION_PERMISSIONS.runRead),
    validateId,
    endpoint(controller.progress.bind(controller)),
  );
  router.post(
    '/runs/:id/retry-failed',
    requirePermission(SIMULATION_PERMISSIONS.retry),
    requirePermission(SIMULATION_PERMISSIONS.execute),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    (req, res, next) => {
      void service.getRun(Number(req.tenant?.companyId), req.params.id).then(run => {
        const bulk = run.executionScope ? run.executionScope === 'bulk' : run.type === 'BULK_PAYROLL' || run.employeeIds?.length !== 1;
        requirePermission(bulk ? SIMULATION_PERMISSIONS.bulk : SIMULATION_PERMISSIONS.individual)(req, res, next);
      }).catch(next);
    },
    endpoint(controller.retry.bind(controller)),
  );
  router.post(
    '/runs/:id/cancel',
    requirePermission(SIMULATION_PERMISSIONS.cancel),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.cancel.bind(controller)),
  );
  router.get(
    '/runs/:id/explanation',
    requirePermission(SIMULATION_PERMISSIONS.runRead),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    (req, res, next) => {
      if (
        !idSchema.safeParse(req.params.id).success ||
        !idSchema.safeParse(req.query.employeeId).success
      ) {
        res.status(400).json({ success: false, message: 'runId e employeeId devem ser UUIDs.' });
        return;
      }
      next();
    },
    endpoint(controller.explanation.bind(controller)),
  );
  router.get(
    '/comparisons/:id',
    requirePermission(SIMULATION_PERMISSIONS.runRead),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    (req, res, next) => {
      void service
        .getComparison(Number(res.req.tenant?.companyId), req.params.id)
        .then((data) => res.json({ success: true, data }))
        .catch(next);
    },
  );
  router.post(
    '/comparisons',
    requirePermission(SIMULATION_PERMISSIONS.comparison),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    endpoint(controller.compare.bind(controller)),
  );
  router.post(
    '/comparisons/current-payroll',
    requirePermission(SIMULATION_PERMISSIONS.comparison),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    endpoint(controller.comparePayroll.bind(controller)),
  );
  router.post(
    '/runs/:id/projections',
    requirePermission(SIMULATION_PERMISSIONS.projections),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.projections.bind(controller)),
  );
  router.get(
    '/runs/:id/projections',
    requirePermission(SIMULATION_PERMISSIONS.projections),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.projections.bind(controller)),
  );

  router.get(
    '/proposals',
    requirePermission(SIMULATION_PERMISSIONS.proposalRead),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    endpoint(controller.proposals.bind(controller)),
  );
  router.post(
    '/scenarios/:id/proposals',
    requirePermission(SIMULATION_PERMISSIONS.proposalCreate),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.proposals.bind(controller)),
  );
  router.get(
    '/proposals/:id',
    requirePermission(SIMULATION_PERMISSIONS.proposalRead),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.proposal.bind(controller)),
  );
  router.post(
    '/proposals/:id/approve',
    requirePermission(SIMULATION_PERMISSIONS.approve),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint((req, res) => controller.decide(req, res, 'APPROVED')),
  );
  router.post(
    '/proposals/:id/reject',
    requirePermission(SIMULATION_PERMISSIONS.reject),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint((req, res) => controller.decide(req, res, 'REJECTED')),
  );
  router.post(
    '/proposals/:id/request-revision',
    requirePermission(SIMULATION_PERMISSIONS.approve),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint((req, res) => controller.decide(req, res, 'REVISION_REQUESTED')),
  );

  router.post(
    '/runs/:id/exports',
    requirePermission(SIMULATION_PERMISSIONS.exportsCreate),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.export.bind(controller)),
  );
  router.get(
    '/exports',
    requirePermission(SIMULATION_PERMISSIONS.exportsDownload),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    endpoint(async (req, res) => {
      const runId = req.query.runId === undefined ? undefined : idSchema.parse(req.query.runId);
      const data = await service.listExports(Number(req.tenant?.companyId), runId);
      res.json({ success: true, data });
    }),
  );
  router.get(
    '/exports/:id',
    requirePermission(SIMULATION_PERMISSIONS.exportsDownload),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    (req, res, next) => {
      void service
        .getExport(Number(res.req.tenant?.companyId), req.params.id)
        .then((data) => res.json({ success: true, data }))
        .catch(next);
    },
  );
  router.get(
    '/exports/:id/download',
    requirePermission(SIMULATION_PERMISSIONS.exportsDownload),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    endpoint(controller.download.bind(controller)),
  );
  return router;
};
