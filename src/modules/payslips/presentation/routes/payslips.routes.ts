import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { z } from 'zod';
import { PayslipsController } from '../controllers/payslips.controller';
import {
  correctionSchema,
  createPayslipBatchSchema,
  employeeUserLinkSchema,
  exportReportSchema,
  generatePayslipSchema,
  listQuerySchema,
  payslipPolicySchema,
  previewTemplateVersionBodySchema,
  publishSchema,
  templateSchema,
  templateVersionSchema,
} from '../schemas/payslips.schema';

const validate =
  (
    target: 'body' | 'query',
    schema: z.ZodTypeAny,
  ): ((req: Request, _res: Response, next: NextFunction) => void) =>
  (req, _res, next) => {
    try {
      if (target === 'body') req.body = schema.parse(req.body);
      else req.query = schema.parse(req.query) as Request['query'];
      next();
    } catch (error) {
      next(error);
    }
  };

const validateId = (req: Request, _res: Response, next: NextFunction) => {
  try {
    req.params.id = z.string().uuid().parse(req.params.id);
    next();
  } catch (error) {
    next(error);
  }
};
const endpoint = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void fn(req, res).catch(next); };

export const createPayslipsRoutes = (
  controller: PayslipsController,
  requirePermission: (
    permission: string,
  ) => (req: Request, res: Response, next: NextFunction) => void,
): Router => {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  const issuanceRead = [requirePermission('payslips:read'), requirePermission('payslips:read-sensitive')];
  router.get('/issuance/runs', ...issuanceRead, endpoint(controller.issuanceRuns.bind(controller)));
  router.get('/issuance/runs/:id/results', ...issuanceRead, validateId, endpoint(controller.issuanceResults.bind(controller)));
  router.get('/issuance/templates', ...issuanceRead, endpoint(controller.issuanceTemplates.bind(controller)));

  router.get('/me', requirePermission('payslips:self:read'), endpoint(controller.myPayslips.bind(controller)),
  );
  router.get('/me/:id', requirePermission('payslips:self:read'), validateId, endpoint(controller.myPayslip.bind(controller)),
  );
  router.get(
    '/me/:id/download',
    requirePermission('payslips:self:download'),
    validateId,
    endpoint(controller.myDownload.bind(controller)),
  );
  router.post(
    '/employees/:employeeId/link',
    requirePermission('payslips:employees:link'),
    (req, res, next) => {
      if (!z.string().uuid().safeParse(req.params.employeeId).success) {
        res.status(400).json({ success: false, message: 'Invalid employee id.' });
        return;
      }
      next();
    },
    validate('body', employeeUserLinkSchema),
    endpoint(controller.linkEmployee.bind(controller)),
  );
  router.get('/policies', requirePermission('payslips:policies:manage'), endpoint(controller.getPolicy.bind(controller)),
  );
  router.put(
    '/policies',
    requirePermission('payslips:policies:manage'),
    validate('body', payslipPolicySchema),
    endpoint(controller.updatePolicy.bind(controller)),
  );

  router.get('/batches', requirePermission('payslips:read'), endpoint(controller.listBatches.bind(controller)),
  );
  router.post(
    '/batches',
    requirePermission('payslips:generate-batch'),
    validate('body', createPayslipBatchSchema),
    endpoint(controller.createBatch.bind(controller)),
  );
  router.get('/batches/:id', requirePermission('payslips:read'), validateId, endpoint(controller.getBatch.bind(controller)),
  );
  router.post(
    '/batches/:id/generate',
    requirePermission('payslips:generate-batch'),
    validateId,
    endpoint(controller.generateBatch.bind(controller)),
  );
  router.get('/batches/:id/progress', requirePermission('payslips:read'), validateId, endpoint(controller.batchProgress.bind(controller)),
  );
  router.post(
    '/batches/:id/retry-failed',
    requirePermission('payslips:retry-generation'),
    validateId,
    endpoint(controller.retryFailed.bind(controller)),
  );
  router.post(
    '/batches/:id/publish',
    requirePermission('payslips:publish-batch'),
    validateId,
    endpoint(controller.publishBatch.bind(controller)),
  );

  router.get('/templates', requirePermission('payslips:read'), endpoint(controller.listTemplates.bind(controller)),
  );
  router.post(
    '/templates',
    requirePermission('payslips:templates:create'),
    validate('body', templateSchema),
    endpoint(controller.createTemplate.bind(controller)),
  );
  router.get('/templates/:id', requirePermission('payslips:read'), validateId, endpoint(controller.getTemplate.bind(controller)),
  );
  router.post(
    '/templates/:id/versions',
    requirePermission('payslips:templates:create'),
    validateId,
    validate('body', templateVersionSchema.omit({ templateId: true })),
    endpoint(controller.createTemplateVersion.bind(controller)),
  );
  router.post(
    '/templates/:id/preview',
    requirePermission('payslips:read'),
    validateId,
    validate('body', previewTemplateVersionBodySchema),
    endpoint(controller.previewTemplate.bind(controller)),
  );
  router.post(
    '/template-versions/:id/publish',
    requirePermission('payslips:templates:publish'),
    validateId,
    endpoint(controller.publishTemplateVersion.bind(controller)),
  );

  router.get('/reports/summary', requirePermission('payslips:reports:read'), endpoint(controller.summary.bind(controller)),
  );
  router.post(
    '/exports',
    requirePermission('payslips:export'),
    requirePermission('payslips:read-sensitive'),
    validate('body', exportReportSchema),
    endpoint(controller.export.bind(controller)),
  );

  router.get(
    '/',
    requirePermission('payslips:read'),
    requirePermission('payslips:read-sensitive'),
    validate('query', listQuerySchema),
    endpoint(controller.list.bind(controller)),
  );
  router.post(
    '/',
    requirePermission('payslips:generate'),
    requirePermission('payslips:read-sensitive'),
    validate('body', generatePayslipSchema),
    endpoint(controller.generate.bind(controller)),
  );
  router.get(
    '/:id',
    requirePermission('payslips:read'),
    requirePermission('payslips:read-sensitive'),
    validateId,
    endpoint(controller.get.bind(controller)),
  );
  router.get(
    '/:id/download',
    requirePermission('payslips:download'),
    requirePermission('payslips:read-sensitive'),
    validateId,
    endpoint(controller.download.bind(controller)),
  );
  router.get(
    '/:id/print',
    requirePermission('payslips:print'),
    requirePermission('payslips:read-sensitive'),
    validateId,
    endpoint(controller.print.bind(controller)),
  );
  router.get(
    '/:id/preview',
    requirePermission('payslips:read'),
    requirePermission('payslips:read-sensitive'),
    validateId,
    endpoint(controller.preview.bind(controller)),
  );
  router.post(
    '/:id/publish',
    requirePermission('payslips:publish'),
    requirePermission('payslips:read-sensitive'),
    validateId,
    validate('body', publishSchema),
    endpoint(controller.publish.bind(controller)),
  );
  router.get('/:id/history', requirePermission('payslips:history:read'), requirePermission('payslips:read-sensitive'), validateId, endpoint(controller.history.bind(controller)),
  );
  router.get(
    '/:id/verification',
    requirePermission('payslips:verification:read'),
    validateId,
    endpoint(controller.verification.bind(controller)),
  );
  router.post(
    '/:id/corrections',
    requirePermission('payslips:corrections:create'),
    requirePermission('payslips:read-sensitive'),
    validateId,
    validate('body', correctionSchema),
    endpoint(controller.createCorrection.bind(controller)),
  );
  router.get(
    '/:id/corrections',
    requirePermission('payslips:corrections:read'),
    requirePermission('payslips:read-sensitive'),
    validateId,
    endpoint(controller.getCorrections.bind(controller)),
  );
  router.post(
    '/:id/duplicate-copy',
    requirePermission('payslips:download'),
    requirePermission('payslips:read-sensitive'),
    validateId,
    endpoint(controller.duplicateCopy.bind(controller)),
  );

  return router;
};
