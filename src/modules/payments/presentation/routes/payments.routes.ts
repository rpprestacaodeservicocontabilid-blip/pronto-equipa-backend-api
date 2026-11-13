import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { PaymentsController } from '../controllers/payments.controller';
import {
  bankAccountSchema,
  bankAccountUpdateSchema,
  batchApprovalSchema,
  exportRequestSchema,
  listQuerySchema,
  orderExecutionSchema,
  paymentBatchItemSchema,
  paymentBatchSchema,
  paymentIdSchema,
  paymentInstructionSchema,
  providerConfigurationSchema,
  reconcileSchema,
  statementImportSchema,
} from '../schemas/payments.schema';

const validate =
  (
    target: 'body' | 'query',
    schema: z.ZodTypeAny,
  ): ((req: Request, _res: Response, next: NextFunction) => void) =>
  (req, _res, next) => {
    try {
      if (target === 'body') {
        req.body = schema.parse(req.body);
      } else {
        req.query = schema.parse(req.query) as Request['query'];
      }
      next();
    } catch (error) {
      next(error);
    }
  };

const validateId: (req: Request, _res: Response, next: NextFunction) => void = (
  req,
  _res,
  next,
) => {
  try {
    req.params.id = paymentIdSchema.parse(req.params.id);
    next();
  } catch (error) {
    next(error);
  }
};

export const createPaymentsRoutes = (
  controller: PaymentsController,
  requirePermission: (
    permission: string,
  ) => (req: Request, res: Response, next: NextFunction) => void,
): Router => {
  const router = Router();

  router.get(
    '/instructions',
    requirePermission('payments:read'),
    validate('query', listQuerySchema),
    (req, res) => controller.listInstructions(req, res),
  );
  router.post(
    '/instructions',
    requirePermission('payments:instructions:create'),
    validate('body', paymentInstructionSchema),
    (req, res) => controller.createInstruction(req, res),
  );
  router.get(
    '/instructions/:id',
    requirePermission('payments:instructions:read'),
    validateId,
    (req, res) => controller.getInstruction(req, res),
  );
  router.post(
    '/instructions/:id/cancel',
    requirePermission('payments:instructions:cancel'),
    validateId,
    (req, res) => controller.cancelInstruction(req, res),
  );
  router.get(
    '/instructions/:id/history',
    requirePermission('payments:history:read'),
    validateId,
    (req, res) => controller.getInstructionHistory(req, res),
  );

  router.get(
    '/batches',
    requirePermission('payments:read'),
    validate('query', listQuerySchema),
    (req, res) => controller.listBatches(req, res),
  );
  router.post(
    '/batches',
    requirePermission('payments:batches:create'),
    validate('body', paymentBatchSchema),
    (req, res) => controller.createBatch(req, res),
  );
  router.get('/batches/:id', requirePermission('payments:read'), validateId, (req, res) =>
    controller.getBatch(req, res),
  );
  router.post(
    '/batches/:id/items',
    requirePermission('payments:batches:update'),
    validateId,
    validate('body', paymentBatchItemSchema),
    (req, res) => controller.addBatchItem(req, res),
  );
  router.post(
    '/batches/:id/validate',
    requirePermission('payments:batches:validate'),
    validateId,
    (req, res) => controller.validateBatch(req, res),
  );
  router.post(
    '/batches/:id/submit',
    requirePermission('payments:batches:submit'),
    validateId,
    (req, res) => controller.submitBatch(req, res),
  );
  router.post(
    '/batches/:id/approve',
    requirePermission('payments:batches:approve'),
    validateId,
    validate('body', batchApprovalSchema),
    (req, res) => controller.approveBatch(req, res),
  );
  router.post(
    '/batches/:id/reject',
    requirePermission('payments:batches:reject'),
    validateId,
    validate('body', batchApprovalSchema),
    (req, res) => controller.rejectBatch(req, res),
  );
  router.post(
    '/batches/:id/execute',
    requirePermission('payments:batches:execute'),
    validateId,
    validate('body', z.object({ providerId: z.string().trim().min(1) })),
    (req, res) => controller.executeBatch(req, res),
  );
  router.get('/batches/:id/progress', requirePermission('payments:read'), validateId, (req, res) =>
    controller.getBatchProgress(req, res),
  );

  router.get('/orders', requirePermission('payments:orders:read'), (req, res) =>
    controller.listOrders(req, res),
  );
  router.get('/orders/:id', requirePermission('payments:orders:read'), validateId, (req, res) =>
    controller.getOrder(req, res),
  );
  router.post(
    '/orders/:id/execute',
    requirePermission('payments:orders:execute'),
    validateId,
    validate('body', orderExecutionSchema),
    (req, res) => controller.executeOrder(req, res),
  );
  router.get(
    '/orders/:id/attempts',
    requirePermission('payments:orders:read'),
    validateId,
    (req, res) => controller.listOrderAttempts(req, res),
  );

  router.get('/transactions', requirePermission('payments:transactions:read'), (req, res) =>
    controller.listTransactions(req, res),
  );
  router.get(
    '/transactions/:id',
    requirePermission('payments:transactions:read'),
    validateId,
    (req, res) => controller.getTransaction(req, res),
  );
  router.post(
    '/transactions/:id/reconcile',
    requirePermission('payments:reconciliation:execute'),
    validateId,
    validate('body', reconcileSchema),
    (req, res) => controller.reconcileTransaction(req, res),
  );

  router.get('/bank-accounts', requirePermission('payments:bank-accounts:read'), (req, res) =>
    controller.listBankAccounts(req, res),
  );
  router.post(
    '/bank-accounts',
    requirePermission('payments:bank-accounts:manage'),
    validate('body', bankAccountSchema),
    (req, res) => controller.registerBankAccount(req, res),
  );
  router.patch(
    '/bank-accounts/:id',
    requirePermission('payments:bank-accounts:manage'),
    validateId,
    validate('body', bankAccountUpdateSchema),
    (req, res) => controller.updateBankAccount(req, res),
  );
  router.post(
    '/bank-accounts/:id/verify',
    requirePermission('payments:bank-accounts:verify'),
    validateId,
    (req, res) => controller.verifyBankAccount(req, res),
  );

  router.get('/providers', requirePermission('payments:providers:read'), (req, res) =>
    controller.listProviders(req, res),
  );
  router.post(
    '/provider-configurations',
    requirePermission('payments:providers:manage'),
    validate('body', providerConfigurationSchema),
    (req, res) => controller.configureProvider(req, res),
  );
  router.get('/provider-configurations', requirePermission('payments:providers:read'), (req, res) =>
    controller.listProviderConfigurations(req, res),
  );
  router.post(
    '/bank-files',
    requirePermission('payments:export'),
    validate('body', exportRequestSchema),
    (req, res) => controller.generateBankFile(req, res),
  );

  router.post(
    '/bank-statements/import',
    requirePermission('payments:reconciliation:execute'),
    validate('body', statementImportSchema),
    (req, res) => controller.importStatement(req, res),
  );
  router.get('/reconciliations', requirePermission('payments:reconciliation:read'), (req, res) =>
    controller.listReconciliations(req, res),
  );
  router.post(
    '/reconciliations/run',
    requirePermission('payments:reconciliation:execute'),
    validate('body', z.object({ reference: z.string().trim().min(1) })),
    (req, res) => controller.runReconciliation(req, res),
  );
  router.get(
    '/reconciliations/:id',
    requirePermission('payments:reconciliation:read'),
    validateId,
    (req, res) => controller.getReconciliation(req, res),
  );
  router.post(
    '/reconciliations/:id/resolve',
    requirePermission('payments:reconciliation:resolve'),
    validateId,
    validate('body', z.object({ notes: z.string().trim().max(2000).optional() })),
    (req, res) => controller.resolveReconciliationException(req, res),
  );

  router.get('/returns', requirePermission('payments:transactions:read'), (req, res) =>
    controller.listReturns(req, res),
  );

  router.get('/reports/summary', requirePermission('payments:reports:read'), (req, res) =>
    controller.summaryReport(req, res),
  );
  router.get('/reports/settlements', requirePermission('payments:reports:read'), (req, res) =>
    controller.settlementReport(req, res),
  );
  router.get('/reports/failed', requirePermission('payments:reports:read'), (req, res) =>
    controller.failedReport(req, res),
  );
  router.get('/reports/returns', requirePermission('payments:reports:read'), (req, res) =>
    controller.returnsReport(req, res),
  );
  router.get('/reports/reconciliation', requirePermission('payments:reports:read'), (req, res) =>
    controller.reconciliationReport(req, res),
  );
  router.post(
    '/exports',
    requirePermission('payments:export'),
    validate('body', exportRequestSchema),
    (req, res) => controller.exportReport(req, res),
  );

  return router;
};
