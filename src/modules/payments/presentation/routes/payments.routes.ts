import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
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
  reconciliationResolutionSchema,
  paymentPolicySchema,
  paymentBeneficiarySchema,
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
const endpoint = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void fn(req, res).catch(next); };

export const createPaymentsRoutes = (
  controller: PaymentsController,
  requirePermission: (
    permission: string,
  ) => (req: Request, res: Response, next: NextFunction) => void,
): Router => {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.patch('/instructions/:id/beneficiary', requirePermission('payments:beneficiaries:manage'),
    validateId, validate('body', paymentBeneficiarySchema), endpoint(controller.setInstructionBeneficiary.bind(controller)));
  router.post('/orders/:id/status', requirePermission('payments:orders:status'),
    validateId, endpoint(controller.refreshOrderStatus.bind(controller)));
  router.get('/policies', requirePermission('payments:policies:read'), endpoint(controller.getPaymentPolicy.bind(controller)));
  router.put('/policies', requirePermission('payments:policies:manage'),
    validate('body', paymentPolicySchema), endpoint(controller.configurePaymentPolicy.bind(controller)));
  router.get('/execution-providers', requirePermission('payments:providers:read'), endpoint(controller.executionProviders.bind(controller)));

  router.get(
    '/instructions',
    requirePermission('payments:read'),
    validate('query', listQuerySchema),
    endpoint(controller.listInstructions.bind(controller)),
  );
  router.post(
    '/instructions',
    requirePermission('payments:instructions:create'),
    validate('body', paymentInstructionSchema),
    endpoint(controller.createInstruction.bind(controller)),
  );
  router.get(
    '/instructions/:id',
    requirePermission('payments:instructions:read'),
    validateId,
    endpoint(controller.getInstruction.bind(controller)),
  );
  router.post(
    '/instructions/:id/cancel',
    requirePermission('payments:instructions:cancel'),
    validateId,
    endpoint(controller.cancelInstruction.bind(controller)),
  );
  router.get(
    '/instructions/:id/history',
    requirePermission('payments:history:read'),
    validateId,
    endpoint(controller.getInstructionHistory.bind(controller)),
  );

  router.get(
    '/batches',
    requirePermission('payments:read'),
    validate('query', listQuerySchema),
    endpoint(controller.listBatches.bind(controller)),
  );
  router.post(
    '/batches',
    requirePermission('payments:batches:create'),
    validate('body', paymentBatchSchema),
    endpoint(controller.createBatch.bind(controller)),
  );
  router.get('/batches/:id', requirePermission('payments:read'), validateId, endpoint(controller.getBatch.bind(controller)),
  );
  router.post(
    '/batches/:id/items',
    requirePermission('payments:batches:update'),
    validateId,
    validate('body', paymentBatchItemSchema),
    endpoint(controller.addBatchItem.bind(controller)),
  );
  router.post(
    '/batches/:id/validate',
    requirePermission('payments:batches:validate'),
    validateId,
    endpoint(controller.validateBatch.bind(controller)),
  );
  router.post(
    '/batches/:id/submit',
    requirePermission('payments:batches:submit'),
    validateId,
    endpoint(controller.submitBatch.bind(controller)),
  );
  router.post(
    '/batches/:id/approve',
    requirePermission('payments:batches:approve'),
    validateId,
    validate('body', batchApprovalSchema),
    endpoint(controller.approveBatch.bind(controller)),
  );
  router.post(
    '/batches/:id/reject',
    requirePermission('payments:batches:reject'),
    validateId,
    validate('body', batchApprovalSchema),
    endpoint(controller.rejectBatch.bind(controller)),
  );
  router.post(
    '/batches/:id/execute',
    requirePermission('payments:batches:execute'),
    validateId,
    validate('body', z.object({ providerId: z.string().trim().min(1) })),
    endpoint(controller.executeBatch.bind(controller)),
  );
  router.get('/batches/:id/progress', requirePermission('payments:read'), validateId, endpoint(controller.getBatchProgress.bind(controller)),
  );

  router.get('/orders', requirePermission('payments:orders:read'), endpoint(controller.listOrders.bind(controller)),
  );
  router.get('/orders/:id', requirePermission('payments:orders:read'), validateId, endpoint(controller.getOrder.bind(controller)),
  );
  router.post(
    '/orders/:id/execute',
    requirePermission('payments:orders:execute'),
    validateId,
    validate('body', orderExecutionSchema),
    endpoint(controller.executeOrder.bind(controller)),
  );
  router.get(
    '/orders/:id/attempts',
    requirePermission('payments:orders:read'),
    validateId,
    endpoint(controller.listOrderAttempts.bind(controller)),
  );

  router.get('/transactions', requirePermission('payments:transactions:read'), endpoint(controller.listTransactions.bind(controller)),
  );
  router.get(
    '/transactions/:id',
    requirePermission('payments:transactions:read'),
    validateId,
    endpoint(controller.getTransaction.bind(controller)),
  );
  router.get('/transactions/:id/receipt', requirePermission('payments:transactions:read'),
    requirePermission('payments:export'), validateId, endpoint(controller.transactionReceipt.bind(controller)));
  router.post(
    '/transactions/:id/reconcile',
    requirePermission('payments:reconciliation:execute'),
    validateId,
    validate('body', reconcileSchema),
    endpoint(controller.reconcileTransaction.bind(controller)),
  );

  router.get('/bank-accounts', requirePermission('payments:bank-accounts:read'), endpoint(controller.listBankAccounts.bind(controller)),
  );
  router.post(
    '/bank-accounts',
    requirePermission('payments:bank-accounts:manage'),
    validate('body', bankAccountSchema),
    endpoint(controller.registerBankAccount.bind(controller)),
  );
  router.patch(
    '/bank-accounts/:id',
    requirePermission('payments:bank-accounts:manage'),
    validateId,
    validate('body', bankAccountUpdateSchema),
    endpoint(controller.updateBankAccount.bind(controller)),
  );
  router.post(
    '/bank-accounts/:id/verify',
    requirePermission('payments:bank-accounts:verify'),
    validateId,
    endpoint(controller.verifyBankAccount.bind(controller)),
  );

  router.get('/providers', requirePermission('payments:providers:read'), endpoint(controller.listProviders.bind(controller)),
  );
  router.post(
    '/provider-configurations',
    requirePermission('payments:providers:manage'),
    validate('body', providerConfigurationSchema),
    endpoint(controller.configureProvider.bind(controller)),
  );
  router.get('/provider-configurations', requirePermission('payments:providers:read'), endpoint(controller.listProviderConfigurations.bind(controller)),
  );
  router.post(
    '/bank-files',
    requirePermission('payments:export'),
    validate('body', exportRequestSchema),
    endpoint(controller.generateBankFile.bind(controller)),
  );

  router.post(
    '/bank-statements/import',
    requirePermission('payments:reconciliation:execute'),
    validate('body', statementImportSchema),
    endpoint(controller.importStatement.bind(controller)),
  );
  router.get('/reconciliations', requirePermission('payments:reconciliation:read'), endpoint(controller.listReconciliations.bind(controller)),
  );
  router.post(
    '/reconciliations/run',
    requirePermission('payments:reconciliation:execute'),
    validate('body', z.object({ reference: z.string().trim().min(1) })),
    endpoint(controller.runReconciliation.bind(controller)),
  );
  router.get(
    '/reconciliations/:id',
    requirePermission('payments:reconciliation:read'),
    validateId,
    endpoint(controller.getReconciliation.bind(controller)),
  );
  router.post(
    '/reconciliations/:id/resolve',
    requirePermission('payments:reconciliation:resolve'),
    validateId,
    validate('body', reconciliationResolutionSchema),
    endpoint(controller.resolveReconciliationException.bind(controller)),
  );

  router.get('/returns', requirePermission('payments:transactions:read'), endpoint(controller.listReturns.bind(controller)),
  );

  router.get('/reports/summary', requirePermission('payments:reports:read'), endpoint(controller.summaryReport.bind(controller)),
  );
  router.get('/reports/settlements', requirePermission('payments:reports:read'), endpoint(controller.settlementReport.bind(controller)),
  );
  router.get('/reports/failed', requirePermission('payments:reports:read'), endpoint(controller.failedReport.bind(controller)),
  );
  router.get('/reports/returns', requirePermission('payments:reports:read'), endpoint(controller.returnsReport.bind(controller)),
  );
  router.get('/reports/reconciliation', requirePermission('payments:reports:read'), endpoint(controller.reconciliationReport.bind(controller)),
  );
  router.post(
    '/exports',
    requirePermission('payments:export'),
    validate('body', exportRequestSchema),
    endpoint(controller.exportReport.bind(controller)),
  );

  return router;
};
