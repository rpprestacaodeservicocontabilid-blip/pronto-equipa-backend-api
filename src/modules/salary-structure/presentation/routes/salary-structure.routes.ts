import { NextFunction, Request, Response, Router } from 'express';
import { SalaryStructureController } from '../controllers/salary-structure.controller';
import {
  applyRevisionSchema,
  createAssignmentSchema,
  createComponentSchema,
  createComponentVersionSchema,
  createGradeSchema,
  createPolicySchema,
  createRevisionBatchSchema,
  createRevisionSchema,
  createStepSchema,
  createStructureSchema,
  createStructureVersionSchema,
  createTableSchema,
  createTableVersionSchema,
  employeeDateQuerySchema,
  exportSchema,
  listQuerySchema,
  revisionDecisionSchema,
  reportTypeSchema,
  salaryIdSchema,
  simulationSchema,
  structureDecisionSchema,
  updateComponentSchema,
} from '../schemas/salary-structure.schema';

type Middleware = (req: Request, res: Response, next: NextFunction) => void;
type Schema = { parse(value: unknown): unknown };

const validate =
  (target: 'body' | 'query', schema: Schema): Middleware =>
  (req, _res, next) => {
    try {
      if (target === 'body') req.body = schema.parse(req.body);
      else req.query = schema.parse(req.query) as Request['query'];
      next();
    } catch (error) {
      next(error);
    }
  };

const validateParams =
  (...keys: string[]): Middleware =>
  (req, _res, next) => {
    try {
      for (const key of keys) req.params[key] = salaryIdSchema.parse(req.params[key]);
      next();
    } catch (error) {
      next(error);
    }
  };

export const createSalaryStructureRoutes = (
  controller: SalaryStructureController,
  requirePermission: (permission: string) => Middleware,
): Router => {
  const router = Router();

  router.get(
    '/components',
    requirePermission('salary-structure:read'),
    validate('query', listQuerySchema),
    (req, res) =>
      controller.read(req, res, (repo, companyId) =>
        repo.listComponents(companyId, req.query as never),
      ),
  );
  router.post(
    '/components',
    requirePermission('salary-structure:components:create'),
    validate('body', createComponentSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.component.created',
        'salary_component',
        (repo, ctx) => repo.createComponent(ctx.companyId, ctx.actorUserId, req.body as never),
        201,
      ),
  );
  router.get(
    '/components/:id',
    requirePermission('salary-structure:read'),
    validateParams('id'),
    (req, res) =>
      controller.read(req, res, (repo, companyId) => repo.getComponent(companyId, req.params.id)),
  );
  router.patch(
    '/components/:id',
    requirePermission('salary-structure:components:update'),
    validateParams('id'),
    validate('body', updateComponentSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.component.updated',
        'salary_component',
        (repo, ctx) => repo.updateComponent(ctx.companyId, req.params.id, req.body as never),
      ),
  );
  router.post(
    '/components/:id/versions',
    requirePermission('salary-structure:components:create'),
    validateParams('id'),
    validate('body', createComponentVersionSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.component-version.created',
        'salary_component_version',
        (repo, ctx) =>
          repo.createComponentVersion(
            ctx.companyId,
            ctx.actorUserId,
            req.params.id,
            req.body as never,
          ),
        201,
      ),
  );
  router.post(
    '/components/:id/versions/:versionId/publish',
    requirePermission('salary-structure:components:publish'),
    validateParams('id', 'versionId'),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.component-version.published',
        'salary_component_version',
        (repo, ctx) =>
          repo.publishComponentVersion(
            ctx.companyId,
            ctx.actorUserId,
            req.params.id,
            req.params.versionId,
          ),
      ),
  );
  router.post(
    '/components/:id/deactivate',
    requirePermission('salary-structure:components:deactivate'),
    validateParams('id'),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.component.deactivated',
        'salary_component',
        (repo, ctx) => repo.deactivateComponent(ctx.companyId, req.params.id),
      ),
  );

  router.get(
    '/tables',
    requirePermission('salary-structure:read'),
    validate('query', listQuerySchema),
    (req, res) =>
      controller.read(req, res, (repo, companyId) =>
        repo.listTables(companyId, req.query as never),
      ),
  );
  router.post(
    '/tables',
    requirePermission('salary-structure:tables:manage'),
    validate('body', createTableSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.table.created',
        'salary_table',
        (repo, ctx) => repo.createTable(ctx.companyId, ctx.actorUserId, req.body as never),
        201,
      ),
  );
  router.get(
    '/tables/:id',
    requirePermission('salary-structure:read'),
    validateParams('id'),
    (req, res) =>
      controller.read(req, res, (repo, companyId) => repo.getTable(companyId, req.params.id)),
  );
  router.post(
    '/tables/:id/versions',
    requirePermission('salary-structure:tables:manage'),
    validateParams('id'),
    validate('body', createTableVersionSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.table-version.created',
        'salary_table_version',
        (repo, ctx) =>
          repo.createTableVersion(
            ctx.companyId,
            ctx.actorUserId,
            req.params.id,
            (req.body as { effectiveFrom: string }).effectiveFrom,
          ),
        201,
      ),
  );
  router.post(
    '/tables/:id/versions/:versionId/publish',
    requirePermission('salary-structure:tables:manage'),
    validateParams('id', 'versionId'),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.table-version.published',
        'salary_table_version',
        (repo, ctx) =>
          repo.publishTableVersion(
            ctx.companyId,
            ctx.actorUserId,
            req.params.id,
            req.params.versionId,
          ),
      ),
  );
  router.post(
    '/tables/:id/grades',
    requirePermission('salary-structure:grades:manage'),
    validateParams('id'),
    validate('body', createGradeSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.grade.created',
        'salary_grade',
        (repo, ctx) => repo.addGrade(ctx.companyId, req.params.id, req.body as never),
        201,
      ),
  );
  router.post(
    '/grades/:gradeId/steps',
    requirePermission('salary-structure:grades:manage'),
    validateParams('gradeId'),
    validate('body', createStepSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.step.created',
        'salary_step',
        (repo, ctx) => repo.addStep(ctx.companyId, req.params.gradeId, req.body as never),
        201,
      ),
  );

  router.get(
    '/structures',
    requirePermission('salary-structure:read'),
    validate('query', listQuerySchema),
    (req, res) =>
      controller.read(req, res, (repo, companyId) =>
        repo.listStructures(companyId, req.query as never),
      ),
  );
  router.post(
    '/structures',
    requirePermission('salary-structure:structures:create'),
    validate('body', createStructureSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.structure.created',
        'salary_structure',
        (repo, ctx) => repo.createStructure(ctx.companyId, ctx.actorUserId, req.body as never),
        201,
      ),
  );
  router.get(
    '/structures/:id',
    requirePermission('salary-structure:read'),
    validateParams('id'),
    (req, res) =>
      controller.read(req, res, (repo, companyId) => repo.getStructure(companyId, req.params.id)),
  );
  router.post(
    '/structures/:id/versions',
    requirePermission('salary-structure:structures:update'),
    validateParams('id'),
    validate('body', createStructureVersionSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.structure-version.created',
        'salary_structure_version',
        (repo, ctx) =>
          repo.createStructureVersion(
            ctx.companyId,
            ctx.actorUserId,
            req.params.id,
            req.body as never,
          ),
        201,
      ),
  );
  router.post(
    '/structures/:id/submit',
    requirePermission('salary-structure:structures:update'),
    validateParams('id'),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.structure.submitted',
        'salary_structure_version',
        (repo, ctx) => repo.submitStructure(ctx.companyId, req.params.id),
      ),
  );
  router.post(
    '/structures/:id/decision',
    requirePermission('salary-structure:structures:approve'),
    validateParams('id'),
    validate('body', structureDecisionSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.structure.decided',
        'salary_structure_version',
        (repo, ctx) =>
          repo.decideStructure(
            ctx.companyId,
            ctx.actorUserId,
            req.params.id,
            (req.body as { decision: 'APPROVED' | 'REJECTED' }).decision,
          ),
      ),
  );
  router.post(
    '/structures/:id/publish',
    requirePermission('salary-structure:structures:publish'),
    validateParams('id'),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.structure.published',
        'salary_structure_version',
        (repo, ctx) => repo.publishStructure(ctx.companyId, ctx.actorUserId, req.params.id),
      ),
  );

  router.get(
    '/assignments',
    requirePermission('salary-structure:assignments:read'),
    validate('query', listQuerySchema),
    (req, res) =>
      controller.read(req, res, (repo, companyId) =>
        repo.listAssignments(companyId, req.query as never),
      ),
  );
  router.post(
    '/assignments',
    requirePermission('salary-structure:assignments:manage'),
    validate('body', createAssignmentSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.assignment.created',
        'employee_salary_assignment',
        (repo, ctx) => repo.createAssignment(ctx.companyId, ctx.actorUserId, req.body as never),
        201,
      ),
  );
  router.get(
    '/assignments/:id',
    requirePermission('salary-structure:assignments:read'),
    validateParams('id'),
    (req, res) =>
      controller.read(req, res, (repo, companyId) => repo.getAssignment(companyId, req.params.id)),
  );
  router.get(
    '/employees/:employeeId/current',
    requirePermission('salary-structure:assignments:read'),
    validateParams('employeeId'),
    validate('query', employeeDateQuerySchema),
    (req, res) =>
      controller.read(req, res, (repo, companyId) =>
        repo.currentSalaryReport(
          companyId,
          req.params.employeeId,
          (req.query as { effectiveDate?: string }).effectiveDate,
        ),
      ),
  );
  router.get(
    '/employees/:employeeId/history',
    requirePermission('salary-structure:history:read'),
    validateParams('employeeId'),
    (req, res) =>
      controller.read(req, res, (repo, companyId) =>
        repo.assignmentHistory(companyId, req.params.employeeId),
      ),
  );
  router.get(
    '/employees/:employeeId/snapshot',
    requirePermission('salary-structure:history:read'),
    validateParams('employeeId'),
    validate('query', employeeDateQuerySchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.snapshot.resolved',
        'salary_snapshot',
        (repo, ctx) =>
          repo.resolveSnapshot(
            ctx.companyId,
            req.params.employeeId,
            (req.query as { effectiveDate?: string }).effectiveDate ??
              new Date().toISOString().slice(0, 10),
          ),
      ),
  );
  router.post(
    '/simulations',
    requirePermission('salary-structure:simulations:run'),
    validate('body', simulationSchema),
    (req, res) =>
      controller.read(req, res, (repo, companyId) => repo.simulate(companyId, req.body as never)),
  );

  router.get(
    '/revisions',
    requirePermission('salary-structure:revisions:read'),
    validate('query', listQuerySchema),
    (req, res) =>
      controller.read(req, res, (repo, companyId) =>
        repo.listRevisions(companyId, req.query as never),
      ),
  );
  router.post(
    '/revisions',
    requirePermission('salary-structure:revisions:create'),
    validate('body', createRevisionSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.revision.created',
        'salary_revision',
        (repo, ctx) => repo.createRevision(ctx.companyId, ctx.actorUserId, req.body as never),
        201,
      ),
  );
  router.get(
    '/revisions/:id',
    requirePermission('salary-structure:revisions:read'),
    validateParams('id'),
    (req, res) =>
      controller.read(req, res, (repo, companyId) => repo.getRevision(companyId, req.params.id)),
  );
  router.post(
    '/revisions/:id/submit',
    requirePermission('salary-structure:revisions:create'),
    validateParams('id'),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.revision.submitted',
        'salary_revision',
        (repo, ctx) => repo.submitRevision(ctx.companyId, req.params.id),
      ),
  );
  router.post(
    '/revisions/:id/decision',
    requirePermission('salary-structure:revisions:approve'),
    validateParams('id'),
    validate('body', revisionDecisionSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.revision.decided',
        'salary_revision',
        (repo, ctx) =>
          repo.decideRevision(
            ctx.companyId,
            ctx.actorUserId,
            req.params.id,
            (req.body as { decision: 'APPROVED' | 'REJECTED' }).decision,
            (req.body as { reason?: string }).reason,
          ),
      ),
  );
  router.post(
    '/revisions/:id/apply',
    requirePermission('salary-structure:revisions:apply'),
    validateParams('id'),
    validate('body', applyRevisionSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.revision.applied',
        'employee_salary_assignment',
        (repo, ctx) =>
          repo.applyRevision(
            ctx.companyId,
            ctx.actorUserId,
            req.params.id,
            (req.body as { idempotencyKey: string }).idempotencyKey,
          ),
      ),
  );

  router.get(
    '/revision-batches/:id',
    requirePermission('salary-structure:revisions:batch'),
    validateParams('id'),
    (req, res) =>
      controller.read(req, res, (repo, companyId) =>
        repo.getRevisionBatch(companyId, req.params.id),
      ),
  );
  router.post(
    '/revision-batches',
    requirePermission('salary-structure:revisions:batch'),
    validate('body', createRevisionBatchSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.revision-batch.created',
        'salary_revision_batch',
        (repo, ctx) => repo.createRevisionBatch(ctx.companyId, ctx.actorUserId, req.body as never),
        201,
      ),
  );
  router.post(
    '/revision-batches/:id/validate',
    requirePermission('salary-structure:revisions:batch'),
    validateParams('id'),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.revision-batch.validated',
        'salary_revision_batch',
        (repo, ctx) => repo.validateRevisionBatch(ctx.companyId, req.params.id),
      ),
  );
  router.post(
    '/revision-batches/:id/approve',
    requirePermission('salary-structure:revisions:approve'),
    validateParams('id'),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.revision-batch.approved',
        'salary_revision_batch',
        (repo, ctx) => repo.approveRevisionBatch(ctx.companyId, ctx.actorUserId, req.params.id),
      ),
  );
  router.post(
    '/revision-batches/:id/apply',
    requirePermission('salary-structure:revisions:batch'),
    validateParams('id'),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.revision-batch.applied',
        'salary_revision_batch',
        (repo, ctx) => repo.applyRevisionBatch(ctx.companyId, ctx.actorUserId, req.params.id),
      ),
  );

  router.get('/policies', requirePermission('salary-structure:read'), (req, res) =>
    controller.read(req, res, (repo, companyId) => repo.listPolicies(companyId)),
  );
  router.post(
    '/policies',
    requirePermission('salary-structure:policies:manage'),
    validate('body', createPolicySchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.policy.created',
        'salary_policy',
        (repo, ctx) => repo.createPolicy(ctx.companyId, ctx.actorUserId, req.body as never),
        201,
      ),
  );
  router.get(
    '/reports/:report',
    requirePermission('salary-structure:reports:read'),
    (req, _res, next) => {
      try {
        req.params.report = reportTypeSchema.parse(req.params.report);
        next();
      } catch (error) {
        next(error);
      }
    },
    validate('query', listQuerySchema),
    (req, res) =>
      controller.read(req, res, (repo, companyId) =>
        repo.report(
          companyId,
          req.params.report as 'components' | 'structures' | 'revisions',
          req.query as never,
        ),
      ),
  );
  router.post(
    '/exports',
    requirePermission('salary-structure:export'),
    validate('body', exportSchema),
    (req, res) =>
      controller.write(
        req,
        res,
        'salary-structure.export.requested',
        'salary_export',
        (repo, ctx) =>
          repo.requestExport(
            ctx.companyId,
            ctx.actorUserId,
            (req.body as { report: string }).report,
            (req.body as { format: string }).format,
            (req.body as { filters: Record<string, unknown> }).filters,
          ),
        202,
      ),
  );

  return router;
};
