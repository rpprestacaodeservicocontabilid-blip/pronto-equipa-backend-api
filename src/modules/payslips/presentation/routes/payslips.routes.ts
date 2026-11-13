import { NextFunction, Request, Response, Router } from 'express';
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
  previewTemplateSchema,
  previewTemplateVersionBodySchema,
  publishSchema,
  templateSchema,
  templateVersionSchema,
} from '../schemas/payslips.schema';

const validate = (target: 'body' | 'query', schema: z.ZodTypeAny): ((req: Request, _res: Response, next: NextFunction) => void) =>
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
    req.params.id = z.string().trim().min(1).parse(req.params.id);
    next();
  } catch (error) {
    next(error);
  }
};

export const createPayslipsRoutes = (
  controller: PayslipsController,
  requirePermission: (permission: string) => (req: Request, res: Response, next: NextFunction) => void,
): Router => {
  const router = Router();

  router.get('/me', requirePermission('payslips:self:read'), (req, res) => controller.myPayslips(req, res));
  router.get('/me/:id', requirePermission('payslips:self:read'), validateId, (req, res) => controller.myPayslip(req, res));
  router.get('/me/:id/download', requirePermission('payslips:self:download'), validateId, (req, res) => controller.myDownload(req, res));
  router.post('/employees/:employeeId/link', requirePermission('payslips:employees:link'), (req, res, next) => { if (!z.string().uuid().safeParse(req.params.employeeId).success) { res.status(400).json({ success: false, message: 'Invalid employee id.' }); return; } next(); }, validate('body', employeeUserLinkSchema), (req, res) => controller.linkEmployee(req, res));
  router.get('/policies', requirePermission('payslips:policies:manage'), (req, res) => controller.getPolicy(req, res));
  router.put('/policies', requirePermission('payslips:policies:manage'), validate('body', payslipPolicySchema), (req, res) => controller.updatePolicy(req, res));

  router.get('/batches', requirePermission('payslips:read'), (req, res) => controller.listBatches(req, res));
  router.post('/batches', requirePermission('payslips:generate-batch'), validate('body', createPayslipBatchSchema), (req, res) => controller.createBatch(req, res));
  router.get('/batches/:id', requirePermission('payslips:read'), validateId, (req, res) => controller.getBatch(req, res));
  router.post('/batches/:id/generate', requirePermission('payslips:generate-batch'), validateId, (req, res) => controller.generateBatch(req, res));
  router.get('/batches/:id/progress', requirePermission('payslips:read'), validateId, (req, res) => controller.batchProgress(req, res));
  router.post('/batches/:id/retry-failed', requirePermission('payslips:retry-generation'), validateId, (req, res) => controller.retryFailed(req, res));
  router.post('/batches/:id/publish', requirePermission('payslips:publish-batch'), validateId, (req, res) => controller.publishBatch(req, res));

  router.get('/templates', requirePermission('payslips:read'), (req, res) => controller.listTemplates(req, res));
  router.post('/templates', requirePermission('payslips:templates:create'), validate('body', templateSchema), (req, res) => controller.createTemplate(req, res));
  router.get('/templates/:id', requirePermission('payslips:read'), validateId, (req, res) => controller.getTemplate(req, res));
  router.post('/templates/:id/versions', requirePermission('payslips:templates:create'), validateId, validate('body', templateVersionSchema.omit({ templateId: true })), (req, res) => controller.createTemplateVersion(req, res));
  router.post('/templates/:id/preview', requirePermission('payslips:read'), validateId, validate('body', previewTemplateVersionBodySchema), (req, res) => controller.previewTemplate(req, res));
  router.post('/template-versions/:id/publish', requirePermission('payslips:templates:publish'), validateId, (req, res) => controller.publishTemplateVersion(req, res));

  router.get('/reports/summary', requirePermission('payslips:reports:read'), (req, res) => controller.summary(req, res));
  router.post('/exports', requirePermission('payslips:export'), requirePermission('payslips:read-sensitive'), validate('body', exportReportSchema), (req, res) => controller.export(req, res));

  router.get('/', requirePermission('payslips:read'), requirePermission('payslips:read-sensitive'), validate('query', listQuerySchema), (req, res) => controller.list(req, res));
  router.post('/', requirePermission('payslips:generate'), validate('body', generatePayslipSchema), (req, res) => controller.generate(req, res));
  router.get('/:id', requirePermission('payslips:read'), requirePermission('payslips:read-sensitive'), validateId, (req, res) => controller.get(req, res));
  router.get('/:id/download', requirePermission('payslips:download'), requirePermission('payslips:read-sensitive'), validateId, (req, res) => controller.download(req, res));
  router.get('/:id/print', requirePermission('payslips:print'), requirePermission('payslips:read-sensitive'), validateId, (req, res) => controller.print(req, res));
  router.get('/:id/preview', requirePermission('payslips:read'), requirePermission('payslips:read-sensitive'), validateId, (req, res) => controller.preview(req, res));
  router.post('/:id/publish', requirePermission('payslips:publish'), validateId, validate('body', publishSchema), (req, res) => controller.publish(req, res));
  router.get('/:id/history', requirePermission('payslips:history:read'), validateId, (req, res) => controller.history(req, res));
  router.get('/:id/verification', requirePermission('payslips:verification:read'), validateId, (req, res) => controller.verification(req, res));
  router.post('/:id/corrections', requirePermission('payslips:corrections:create'), validateId, validate('body', correctionSchema), (req, res) => controller.createCorrection(req, res));
  router.get('/:id/corrections', requirePermission('payslips:corrections:read'), validateId, (req, res) => controller.getCorrections(req, res));
  router.post('/:id/duplicate-copy', requirePermission('payslips:download'), validateId, (req, res) => controller.duplicateCopy(req, res));

  return router;
};
