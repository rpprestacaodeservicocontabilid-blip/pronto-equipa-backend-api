import { NextFunction, Request, Response, Router } from 'express';
import { SimulationsApplicationService } from '../../application/use-cases/simulations-application.service';
import { SIMULATION_PERMISSIONS } from '../../domain/simulation.types';
import { SimulationsController } from '../controllers/simulations.controller';
import { idSchema } from '../schemas/simulations.schema';
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
  const executeScope = (req: Request, res: Response, next: NextFunction) => {
    void service
      .getScenario(Number(res.req.tenant?.companyId), req.params.id)
      .then((scenario) => {
        const type = String(scenario.type);
        const bulk =
          type === 'BULK_PAYROLL' ||
          (Array.isArray(scenario.configuration?.employeeIds) &&
            scenario.configuration.employeeIds.length > 1);
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
    controller.scenarios.bind(controller),
  );
  router.post(
    '/scenarios',
    requirePermission(SIMULATION_PERMISSIONS.create),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    controller.scenarios.bind(controller),
  );
  router.get(
    '/scenarios/:id',
    requirePermission(SIMULATION_PERMISSIONS.read),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    controller.scenario.bind(controller),
  );
  router.patch(
    '/scenarios/:id',
    requirePermission(SIMULATION_PERMISSIONS.update),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    controller.scenario.bind(controller),
  );
  router.post(
    '/scenarios/:id/duplicate',
    requirePermission(SIMULATION_PERMISSIONS.duplicate),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    controller.duplicate.bind(controller),
  );
  router.post(
    '/scenarios/:id/versions',
    requirePermission(SIMULATION_PERMISSIONS.update),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    controller.scenario.bind(controller),
  );
  router.post(
    '/scenarios/:id/archive',
    requirePermission(SIMULATION_PERMISSIONS.archive),
    validateId,
    controller.archive.bind(controller),
  );
  router.get(
    '/scenarios/:id/versions',
    requirePermission(SIMULATION_PERMISSIONS.history),
    validateId,
    controller.versions.bind(controller),
  );
  router.post(
    '/scenarios/:id/runs',
    requirePermission(SIMULATION_PERMISSIONS.execute),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    executeScope,
    controller.execute.bind(controller),
  );

  router.get(
    '/runs',
    requirePermission(SIMULATION_PERMISSIONS.runRead),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    controller.runs.bind(controller),
  );
  router.get(
    '/runs/:id',
    requirePermission(SIMULATION_PERMISSIONS.runRead),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    controller.run.bind(controller),
  );
  router.get(
    '/runs/:id/results',
    requirePermission(SIMULATION_PERMISSIONS.runRead),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    controller.results.bind(controller),
  );
  router.get(
    '/runs/:id/progress',
    requirePermission(SIMULATION_PERMISSIONS.runRead),
    validateId,
    controller.progress.bind(controller),
  );
  router.post(
    '/runs/:id/retry-failed',
    requirePermission(SIMULATION_PERMISSIONS.retry),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    controller.retry.bind(controller),
  );
  router.post(
    '/runs/:id/cancel',
    requirePermission(SIMULATION_PERMISSIONS.cancel),
    validateId,
    controller.cancel.bind(controller),
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
    controller.explanation.bind(controller),
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
    controller.compare.bind(controller),
  );
  router.post(
    '/comparisons/current-payroll',
    requirePermission(SIMULATION_PERMISSIONS.comparison),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    controller.comparePayroll.bind(controller),
  );
  router.post(
    '/runs/:id/projections',
    requirePermission(SIMULATION_PERMISSIONS.projections),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    controller.projections.bind(controller),
  );
  router.get(
    '/runs/:id/projections',
    requirePermission(SIMULATION_PERMISSIONS.projections),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    controller.projections.bind(controller),
  );

  router.get(
    '/proposals',
    requirePermission(SIMULATION_PERMISSIONS.proposalRead),
    controller.proposals.bind(controller),
  );
  router.post(
    '/scenarios/:id/proposals',
    requirePermission(SIMULATION_PERMISSIONS.proposalCreate),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    controller.proposals.bind(controller),
  );
  router.get(
    '/proposals/:id',
    requirePermission(SIMULATION_PERMISSIONS.proposalRead),
    validateId,
    controller.proposal.bind(controller),
  );
  router.post(
    '/proposals/:id/approve',
    requirePermission(SIMULATION_PERMISSIONS.approve),
    validateId,
    (req, res) => controller.decide(req, res, 'APPROVED'),
  );
  router.post(
    '/proposals/:id/reject',
    requirePermission(SIMULATION_PERMISSIONS.reject),
    validateId,
    (req, res) => controller.decide(req, res, 'REJECTED'),
  );
  router.post(
    '/proposals/:id/request-revision',
    requirePermission(SIMULATION_PERMISSIONS.approve),
    validateId,
    (req, res) => controller.decide(req, res, 'REVISION_REQUESTED'),
  );

  router.post(
    '/runs/:id/exports',
    requirePermission(SIMULATION_PERMISSIONS.exportsCreate),
    requirePermission(SIMULATION_PERMISSIONS.sensitive),
    validateId,
    controller.export.bind(controller),
  );
  router.get(
    '/exports/:id',
    requirePermission(SIMULATION_PERMISSIONS.exportsDownload),
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
    controller.download.bind(controller),
  );
  return router;
};
