import { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { PayrollController } from '../controllers/payroll.controller';
import {
  payrollIdSchema as id,
  payrollPeriodSchema as dates,
  payrollVersionSchema as version,
  payrollRunSchema as run,
} from '../schemas/payroll.schema';
import { PayrollWorkflowService } from '../../application/use-cases/payroll-workflow.service';
import { simulateSamplePayroll } from '../../../payroll-engine/presentation/internal/payroll-simulation.operation';

export function createPayrollRoutes(options: {
  requirePermission: (permission: string) => RequestHandler;
  audit: AuditRecorderPort;
  service: PayrollWorkflowService;
}): { routes: Router } {
  const routes = Router();
  const repository = options.service;
  const handler = new PayrollController(options.audit).handle;
  routes.post(
    '/engine/simulate',
    options.requirePermission('payroll:read'),
    options.requirePermission('payroll:runs:create'),
    handler(simulateSamplePayroll),
  );
  for (const entity of ['periods', 'runs'] as const) {
    routes.get(
      `/${entity}`,
      options.requirePermission('payroll:read'),
      handler((req, tenant) => {
        const query = z
          .object({
            page: z.coerce.number().int().positive().default(1),
            limit: z.coerce.number().int().min(1).max(100).default(20),
          })
          .parse(req.query);
        return repository.list(tenant, entity, query.page, query.limit);
      }),
    );
    routes.get(
      `/${entity}/:id`,
      options.requirePermission('payroll:read'),
      handler((req, tenant) => repository.get(tenant, entity, id.parse(req.params.id))),
    );
  }
  routes.post(
    '/periods',
    options.requirePermission('payroll:periods:create'),
    handler(
      (req, tenant, actor) => repository.createPeriod(tenant, actor, dates.parse(req.body)),
      'payroll.period.created',
      201,
    ),
  );
  for (const action of ['open', 'close'] as const)
    routes.post(
      `/periods/:id/${action}`,
      options.requirePermission(`payroll:periods:${action}`),
      handler(
        (req, tenant, actor) =>
          repository.changePeriod(
            tenant,
            actor,
            id.parse(req.params.id),
            version.parse(req.body).expectedVersion,
            action,
          ),
        `payroll.period.${action}`,
      ),
    );
  routes.post(
    '/runs',
    options.requirePermission('payroll:runs:create'),
    handler(
      (req, tenant, actor) => repository.createRun(tenant, actor, run.parse(req.body)),
      'payroll.run.created',
      201,
    ),
  );
  routes.post(
    '/runs/:id/cancel',
    options.requirePermission('payroll:runs:cancel'),
    handler(
      (req, tenant, actor) =>
        repository.cancel(
          tenant,
          actor,
          id.parse(req.params.id),
          version.parse(req.body).expectedVersion,
        ),
      'payroll.run.cancelled',
    ),
  );
  routes.patch(
    '/periods/:id',
    options.requirePermission('payroll:periods:update'),
    handler((req, tenant, actor) => {
      const input = dates.extend({ expectedVersion: z.number().int().positive() }).parse(req.body);
      return repository.updatePeriod(
        tenant,
        actor,
        id.parse(req.params.id),
        input.expectedVersion,
        { startDate: input.startDate, endDate: input.endDate, paymentDate: input.paymentDate },
      );
    }, 'payroll.period.updated'),
  );
  routes.post(
    '/runs/:id/validate',
    options.requirePermission('payroll:runs:validate'),
    handler(
      (req, tenant, actor) =>
        repository.queueValidation(
          tenant,
          actor,
          id.parse(req.params.id),
          version.parse(req.body).expectedVersion,
        ),
      'payroll.run.validation-requested',
      202,
    ),
  );
  for (const action of ['process', 'retry-failed'] as const)
    routes.post(
      `/runs/:id/${action}`,
      options.requirePermission(
        action === 'process' ? 'payroll:runs:process' : 'payroll:runs:retry',
      ),
      handler(
        (req, tenant, actor) =>
          repository.start(
            tenant,
            actor,
            id.parse(req.params.id),
            version.parse(req.body).expectedVersion,
            action === 'retry-failed',
          ),
        `payroll.run.${action}`,
        202,
      ),
    );
  for (const action of ['submit', 'approve', 'reject', 'close'] as const) {
    const permission =
      action === 'close' ? 'payroll:closing:execute' : `payroll:approvals:${action}`;
    routes.post(
      `/runs/:id/${action}`,
      options.requirePermission(permission),
      handler((req, tenant, actor) => {
        const input = version
          .extend({ reason: z.string().trim().min(1).max(1000).optional() })
          .parse(req.body);
        return repository.transition(
          tenant,
          actor,
          id.parse(req.params.id),
          input.expectedVersion,
          action,
          input.reason,
        );
      }, `payroll.run.${action}`),
    );
  }
  for (const resource of [
    'progress',
    'issues',
    'results',
    'summary',
    'closing',
    'history',
    'payment-instructions',
  ] as const) {
    const permission = ['results', 'closing'].includes(resource)
      ? 'payroll:results:read-sensitive'
      : resource === 'payment-instructions'
        ? 'payroll:payments:read'
        : resource === 'history'
          ? 'payroll:history:read'
          : 'payroll:read';
    routes.get(
      `/runs/:id/${resource}`,
      options.requirePermission(permission),
      handler((req, tenant) => repository.query(tenant, id.parse(req.params.id), resource)),
    );
  }
  routes.get(
    '/runs/:id/results/:resultId',
    options.requirePermission('payroll:results:read-sensitive'),
    handler((req, tenant) =>
      repository.query(tenant, id.parse(req.params.id), 'result', id.parse(req.params.resultId)),
    ),
  );
  routes.get(
    '/runs/:id/results/:resultId/explanation',
    options.requirePermission('payroll:results:read-sensitive'),
    handler((req, tenant) =>
      repository.query(
        tenant,
        id.parse(req.params.id),
        'explanation',
        id.parse(req.params.resultId),
      ),
    ),
  );
  routes.post(
    '/runs/:id/payment-instructions',
    options.requirePermission('payroll:payments:prepare'),
    handler(
      (req, tenant, actor) =>
        repository.preparePayments(
          tenant,
          actor,
          id.parse(req.params.id),
          version.parse(req.body).expectedVersion,
        ),
      'payroll.payment-instructions.prepared',
    ),
  );
  routes.get(
    '/runs/:id/comparison',
    options.requirePermission('payroll:results:compare'),
    options.requirePermission('payroll:results:read-sensitive'),
    handler((req, tenant) =>
      repository.comparison(tenant, id.parse(req.params.id), id.parse(req.query.otherRunId)),
    ),
  );
  for (const type of ['summary', 'deductions', 'employer-costs'])
    routes.get(
      `/reports/${type}`,
      options.requirePermission('payroll:reports:read'),
      ...(type === 'summary' ? [] : [options.requirePermission('payroll:results:read-sensitive')]),
      handler((req, tenant) => repository.report(tenant, id.parse(req.query.periodId), type)),
    );
  routes.get(
    '/policies',
    options.requirePermission('payroll:policies:manage'),
    handler((_req, tenant, actor) => repository.policy(tenant, actor)),
  );
  routes.post(
    '/policies',
    options.requirePermission('payroll:policies:manage'),
    handler(
      (req, tenant, actor) =>
        repository.policy(
          tenant,
          actor,
          z
            .object({
              code: z.string().trim().min(1).max(100),
              requiredApprovals: z.number().int().min(1).max(5),
            })
            .strict()
            .parse(req.body),
        ),
      'payroll.policy.created',
      201,
    ),
  );
  for (const [path, runType] of [
    ['corrections', 'CORRECTION'],
    ['supplements', 'SUPPLEMENTARY'],
  ] as const)
    routes.post(
      `/runs/:id/${path}`,
      options.requirePermission('payroll:corrections:create'),
      handler(
        (req, tenant, actor) =>
          repository.createRun(
            tenant,
            actor,
            run.parse({ ...req.body, originalRunId: id.parse(req.params.id), runType }),
          ),
        'payroll.correction.created',
        201,
      ),
    );
  routes.post(
    '/exports',
    options.requirePermission('payroll:export'),
    options.requirePermission('payroll:results:read-sensitive'),
    handler(
      (req, tenant, actor) => {
        const input = z
          .object({
            runId: id,
            format: z.enum(['PDF', 'XLSX']),
            idempotencyKey: z.string().min(1).max(100),
          })
          .strict()
          .parse(req.body);
        return repository.requestExport(
          tenant,
          actor,
          input.runId,
          input.format,
          input.idempotencyKey,
        );
      },
      'payroll.export.requested',
      202,
    ),
  );
  routes.get(
    '/exports/:id/download',
    options.requirePermission('payroll:export'),
    options.requirePermission('payroll:results:read-sensitive'),
    async (req, res, next) => {
      try {
        if (!req.user?.userId || !req.tenant?.companyId) throw new UnauthorizedError();
        const result = await repository.downloadExport(
          req.tenant.companyId,
          id.parse(req.params.id),
        );
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader(
          'Content-Type',
          result.format === 'PDF'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="payroll.${result.format === 'PDF' ? 'pdf' : 'xlsx'}"`,
        );
        res.send(result.buffer);
      } catch (error) {
        next(error);
      }
    },
  );
  return { routes };
}
