import { NextFunction, Request, Response, Router } from 'express';
import { LoansController } from '../controllers/loans.controller';
import {
  confirmDisbursementSchema,
  createApplicationSchema,
  decideApplicationSchema,
  deductionConfirmationSchema,
  deductionRequestSchema,
  disbursementSchema,
  listApplicationsSchema,
  listDeductionsSchema,
  listLoansSchema,
  loanIdSchema,
  loanStatusActionSchema,
  policySchema,
  renegotiationDecisionSchema,
  renegotiationSchema,
  reportQuerySchema,
  repaymentSchema,
  reversalSchema,
  simulationSchema,
  updateApplicationSchema,
} from '../schemas/loans.schema';

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
      for (const key of keys) req.params[key] = loanIdSchema.parse(req.params[key]);
      next();
    } catch (error) {
      next(error);
    }
  };

export const createLoansRoutes = (
  controller: LoansController,
  requirePermission: (permission: string) => Middleware,
): Router => {
  const router = Router();

  router.get(
    '/applications',
    requirePermission('loans.applications.read'),
    validate('query', listApplicationsSchema),
    (req, res) => controller.listApplications(req, res),
  );
  router.post(
    '/applications',
    requirePermission('loans.applications.create'),
    validate('body', createApplicationSchema),
    (req, res) => controller.createApplication(req, res),
  );
  router.get(
    '/applications/:id',
    requirePermission('loans.applications.read'),
    validateParams('id'),
    (req, res) => controller.getApplication(req, res),
  );
  router.patch(
    '/applications/:id',
    requirePermission('loans.applications.update'),
    validateParams('id'),
    validate('body', updateApplicationSchema),
    (req, res) => controller.updateApplication(req, res),
  );
  router.post(
    '/applications/:id/submit',
    requirePermission('loans.applications.submit'),
    validateParams('id'),
    (req, res) => controller.submitApplication(req, res),
  );
  router.post(
    '/applications/:id/decision',
    requirePermission('loans.applications.decide'),
    validateParams('id'),
    validate('body', decideApplicationSchema),
    (req, res) => controller.decideApplication(req, res),
  );
  router.post(
    '/applications/:id/cancel',
    requirePermission('loans.applications.cancel'),
    validateParams('id'),
    (req, res) => controller.cancelApplication(req, res),
  );

  router.get(
    '/',
    requirePermission('loans.loans.read'),
    validate('query', listLoansSchema),
    (req, res) => controller.listLoans(req, res),
  );
  router.get('/reports/summary', requirePermission('loans.reports.read'), (req, res) =>
    controller.summary(req, res),
  );
  router.get(
    '/reports/outstanding',
    requirePermission('loans.reports.read'),
    validate('query', reportQuerySchema),
    (req, res) => controller.outstanding(req, res),
  );
  router.get(
    '/reports/late-installments',
    requirePermission('loans.reports.read'),
    validate('query', reportQuerySchema),
    (req, res) => controller.lateInstallments(req, res),
  );
  router.post(
    '/simulations',
    requirePermission('loans.simulations.create'),
    validate('body', simulationSchema),
    (req, res) => controller.simulate(req, res),
  );
  router.get('/policies', requirePermission('loans.policies.read'), (req, res) =>
    controller.policies(req, res),
  );
  router.post(
    '/policies',
    requirePermission('loans.policies.manage'),
    validate('body', policySchema),
    (req, res) => controller.createPolicy(req, res),
  );
  router.get(
    '/deductions',
    requirePermission('loans.deductions.read'),
    validate('query', listDeductionsSchema),
    (req, res) => controller.deductions(req, res),
  );

  router.get('/:id', requirePermission('loans.loans.read'), validateParams('id'), (req, res) =>
    controller.getLoan(req, res),
  );
  router.get(
    '/:id/balance',
    requirePermission('loans.loans.read'),
    validateParams('id'),
    (req, res) => controller.getBalance(req, res),
  );
  router.get(
    '/:id/plans',
    requirePermission('loans.loans.read'),
    validateParams('id'),
    (req, res) => controller.plans(req, res),
  );
  router.get(
    '/:id/installments',
    requirePermission('loans.loans.read'),
    validateParams('id'),
    (req, res) => controller.installments(req, res),
  );
  router.get(
    '/:id/history',
    requirePermission('loans.loans.read'),
    validateParams('id'),
    (req, res) => controller.history(req, res),
  );
  router.post(
    '/:id/disbursements',
    requirePermission('loans.disbursements.request'),
    validateParams('id'),
    validate('body', disbursementSchema),
    (req, res) => controller.requestDisbursement(req, res),
  );
  router.get(
    '/:id/disbursements',
    requirePermission('loans.disbursements.read'),
    validateParams('id'),
    (req, res) => controller.disbursements(req, res),
  );
  router.post(
    '/:id/disbursements/:disbursementId/confirm',
    requirePermission('loans.disbursements.confirm'),
    validateParams('id', 'disbursementId'),
    validate('body', confirmDisbursementSchema),
    (req, res) => controller.confirmDisbursement(req, res),
  );
  router.post(
    '/:id/repayments',
    requirePermission('loans.repayments.register'),
    validateParams('id'),
    validate('body', repaymentSchema),
    (req, res) => controller.registerRepayment(req, res),
  );
  router.get(
    '/:id/repayments',
    requirePermission('loans.repayments.read'),
    validateParams('id'),
    (req, res) => controller.repayments(req, res),
  );
  router.post(
    '/:id/repayments/:repaymentId/reverse',
    requirePermission('loans.repayments.reverse'),
    validateParams('id', 'repaymentId'),
    validate('body', reversalSchema),
    (req, res) => controller.reverseRepayment(req, res),
  );
  router.post(
    '/:id/deductions',
    requirePermission('loans.deductions.request'),
    validateParams('id'),
    validate('body', deductionRequestSchema),
    (req, res) => controller.requestDeduction(req, res),
  );
  router.post(
    '/deductions/:deductionId/confirm',
    requirePermission('loans.deductions.confirm'),
    validateParams('deductionId'),
    validate('body', deductionConfirmationSchema),
    (req, res) => controller.confirmDeduction(req, res),
  );
  router.post(
    '/:id/renegotiations',
    requirePermission('loans.renegotiations.request'),
    validateParams('id'),
    validate('body', renegotiationSchema),
    (req, res) => controller.requestRenegotiation(req, res),
  );
  router.post(
    '/renegotiations/:renegotiationId/decision',
    requirePermission('loans.renegotiations.decide'),
    validateParams('renegotiationId'),
    validate('body', renegotiationDecisionSchema),
    (req, res) => controller.decideRenegotiation(req, res),
  );
  router.post(
    '/:id/status',
    requirePermission('loans.loans.manage'),
    validateParams('id'),
    validate('body', loanStatusActionSchema),
    (req, res) => controller.setLoanStatus(req, res),
  );
  router.post(
    '/:id/settle',
    requirePermission('loans.loans.settle'),
    validateParams('id'),
    (req, res) => controller.settleLoan(req, res),
  );

  return router;
};
