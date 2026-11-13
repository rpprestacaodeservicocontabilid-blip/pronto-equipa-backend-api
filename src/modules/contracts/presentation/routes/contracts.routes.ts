import { NextFunction, Request, Response, Router } from 'express';
import { ContractsController } from '../controllers/contracts.controller';
import {
  amendContractSchema,
  contractIdSchema,
  createContractSchema,
  createContractTypeSchema,
  documentSchema,
  expiringContractsSchema,
  listContractsSchema,
  renewContractSchema,
  rejectContractSchema,
  suspensionSchema,
  terminationSchema,
  transitionSchema,
  updateDraftSchema,
} from '../schemas/contract.schema';

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

const validateId: Middleware = (req, _res, next) => {
  try {
    req.params.id = contractIdSchema.parse(req.params.id);
    next();
  } catch (error) {
    next(error);
  }
};

export const createContractsRoutes = (
  controller: ContractsController,
  requirePermission: (permission: string) => Middleware,
): Router => {
  const router = Router();

  router.get(
    '/expiring',
    requirePermission('contracts.read'),
    validate('query', expiringContractsSchema),
    (req, res) => controller.expiring(req, res),
  );
  router.get('/types', requirePermission('contracts.read'), (req, res) =>
    controller.types(req, res),
  );
  router.post(
    '/types',
    requirePermission('contracts.types.manage'),
    validate('body', createContractTypeSchema),
    (req, res) => controller.createType(req, res),
  );
  router.get(
    '/',
    requirePermission('contracts.read'),
    validate('query', listContractsSchema),
    (req, res) => controller.list(req, res),
  );
  router.post(
    '/',
    requirePermission('contracts.create'),
    validate('body', createContractSchema),
    (req, res) => controller.create(req, res),
  );

  router.post(
    '/:id/submit',
    requirePermission('contracts.submit'),
    validateId,
    validate('body', transitionSchema),
    (req, res) => controller.transition(req, res, 'PENDING_APPROVAL'),
  );
  router.post(
    '/:id/approve',
    requirePermission('contracts.approve'),
    validateId,
    validate('body', transitionSchema),
    (req, res) => controller.transition(req, res, 'APPROVED'),
  );
  router.post(
    '/:id/reject',
    requirePermission('contracts.reject'),
    validateId,
    validate('body', rejectContractSchema),
    (req, res) => controller.transition(req, res, 'REJECTED'),
  );
  router.post(
    '/:id/activate',
    requirePermission('contracts.activate'),
    validateId,
    validate('body', transitionSchema),
    (req, res) => controller.transition(req, res, 'ACTIVE'),
  );
  router.post(
    '/:id/cancel',
    requirePermission('contracts.update'),
    validateId,
    validate('body', transitionSchema),
    (req, res) => controller.transition(req, res, 'CANCELLED'),
  );
  router.post(
    '/:id/renewals',
    requirePermission('contracts.renew'),
    validateId,
    validate('body', renewContractSchema),
    (req, res) => controller.renew(req, res),
  );
  router.get('/:id/renewals', requirePermission('contracts.history.read'), validateId, (req, res) =>
    controller.records(req, res, 'RENEWAL'),
  );
  router.post(
    '/:id/amendments',
    requirePermission('contracts.amend'),
    validateId,
    validate('body', amendContractSchema),
    (req, res) => controller.amend(req, res),
  );
  router.get('/:id/versions', requirePermission('contracts.history.read'), validateId, (req, res) =>
    controller.records(req, res),
  );
  router.post(
    '/:id/suspensions',
    requirePermission('contracts.suspend'),
    validateId,
    validate('body', suspensionSchema),
    (req, res) => controller.suspend(req, res),
  );
  router.post(
    '/:id/resume',
    requirePermission('contracts.resume'),
    validateId,
    validate('body', transitionSchema),
    (req, res) => controller.resume(req, res),
  );
  router.post(
    '/:id/terminations',
    requirePermission('contracts.terminate'),
    validateId,
    validate('body', terminationSchema),
    (req, res) => controller.terminate(req, res),
  );
  router.post(
    '/:id/archive',
    requirePermission('contracts.archive'),
    validateId,
    validate('body', transitionSchema),
    (req, res) => controller.archive(req, res),
  );
  router.get(
    '/:id/documents',
    requirePermission('contracts.documents.read'),
    validateId,
    (req, res) => controller.records(req, res, 'DOCUMENT'),
  );
  router.post(
    '/:id/documents',
    requirePermission('contracts.documents.manage'),
    validateId,
    validate('body', documentSchema),
    (req, res) => controller.addDocument(req, res),
  );
  router.get('/:id/history', requirePermission('contracts.history.read'), validateId, (req, res) =>
    controller.records(req, res),
  );
  router.get('/:id', requirePermission('contracts.read'), validateId, (req, res) =>
    controller.get(req, res),
  );
  router.patch(
    '/:id',
    requirePermission('contracts.update'),
    validateId,
    validate('body', updateDraftSchema),
    (req, res) => controller.updateDraft(req, res),
  );

  return router;
};
