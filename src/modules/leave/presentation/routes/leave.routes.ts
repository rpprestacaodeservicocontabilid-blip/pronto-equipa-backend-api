import { NextFunction, Request, Response, Router } from 'express';
import { LeaveController } from '../controllers/leave.controller';
import {
  accrueEntitlementSchema,
  absencesQuerySchema,
  adjustBalanceSchema,
  approveLeaveSchema,
  balancesQuerySchema,
  calendarQuerySchema,
  completeLeaveSchema,
  conflictQuerySchema,
  createAccountSchema,
  createLeaveRequestSchema,
  interruptLeaveSchema,
  leaveIdSchema,
  listAccountsSchema,
  listLeaveRequestsSchema,
  listMovementsSchema,
  recalculateEntitlementsSchema,
  rejectLeaveSchema,
  rescheduleLeaveSchema,
  returnLeaveSchema,
  submitLeaveSchema,
  takenDaysQuerySchema,
  updateLeaveRequestSchema,
  versionOnlySchema,
} from '../schemas/leave.schema';

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
    req.params.id = leaveIdSchema.parse(req.params.id);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Rotas do módulo `leave` (prefixo `/api/v1/leave`).
 *
 * Cada rota declara a sua permissão em PONTO
 * (`leave.requests.approve`, ...) — mesmo estilo dos módulos
 * `employees`/`contracts`.
 */
export const createLeaveRoutes = (
  controller: LeaveController,
  requirePermission: (permission: string) => Middleware,
): Router => {
  const router = Router();

  // ----------------------------------------------------------
  // Contas, direitos e saldos
  // ----------------------------------------------------------

  router.get(
    '/accounts',
    requirePermission('leave.accounts.read'),
    validate('query', listAccountsSchema),
    (req, res) => controller.listAccounts(req, res),
  );
  router.post(
    '/accounts',
    requirePermission('leave.accounts.manage'),
    validate('body', createAccountSchema),
    (req, res) => controller.createAccount(req, res),
  );
  router.get(
    '/accounts/:id/balance',
    requirePermission('leave.accounts.read'),
    validateId,
    (req, res) => controller.getBalance(req, res),
  );
  router.get(
    '/accounts/:id/movements',
    requirePermission('leave.accounts.read'),
    validateId,
    validate('query', listMovementsSchema),
    (req, res) => controller.listMovements(req, res),
  );
  router.get(
    '/accounts/:id/entitlements',
    requirePermission('leave.accounts.read'),
    validateId,
    (req, res) => controller.listEntitlements(req, res),
  );
  router.post(
    '/accounts/:id/entitlements',
    requirePermission('leave.entitlements.manage'),
    validateId,
    validate('body', accrueEntitlementSchema),
    (req, res) => controller.accrueEntitlement(req, res),
  );
  router.post(
    '/accounts/:id/entitlements/recalculate',
    requirePermission('leave.entitlements.manage'),
    validateId,
    validate('body', recalculateEntitlementsSchema),
    (req, res) => controller.recalculateEntitlements(req, res),
  );
  router.post(
    '/accounts/:id/adjustments',
    requirePermission('leave.balance.adjust'),
    validateId,
    validate('body', adjustBalanceSchema),
    (req, res) => controller.adjustBalance(req, res),
  );
  router.get('/accounts/:id', requirePermission('leave.accounts.read'), validateId, (req, res) =>
    controller.getAccount(req, res),
  );

  // ----------------------------------------------------------
  // Pedidos de férias
  // ----------------------------------------------------------

  router.get(
    '/requests',
    requirePermission('leave.requests.read'),
    validate('query', listLeaveRequestsSchema),
    (req, res) => controller.listRequests(req, res),
  );
  router.post(
    '/requests',
    requirePermission('leave.requests.create'),
    validate('body', createLeaveRequestSchema),
    (req, res) => controller.createRequest(req, res),
  );
  router.get(
    '/requests/:id/history',
    requirePermission('leave.requests.read'),
    validateId,
    (req, res) => controller.getRequestHistory(req, res),
  );
  router.post(
    '/requests/:id/submit',
    requirePermission('leave.requests.submit'),
    validateId,
    validate('body', submitLeaveSchema),
    (req, res) => controller.submitRequest(req, res),
  );
  router.post(
    '/requests/:id/approve',
    requirePermission('leave.requests.approve'),
    validateId,
    validate('body', approveLeaveSchema),
    (req, res) => controller.approveRequest(req, res),
  );
  router.post(
    '/requests/:id/reject',
    requirePermission('leave.requests.reject'),
    validateId,
    validate('body', rejectLeaveSchema),
    (req, res) => controller.rejectRequest(req, res),
  );
  router.post(
    '/requests/:id/return',
    requirePermission('leave.requests.return'),
    validateId,
    validate('body', returnLeaveSchema),
    (req, res) => controller.returnRequest(req, res),
  );
  router.post(
    '/requests/:id/cancel',
    requirePermission('leave.requests.cancel'),
    validateId,
    validate('body', versionOnlySchema),
    (req, res) => controller.cancelRequest(req, res),
  );
  router.post(
    '/requests/:id/reschedule',
    requirePermission('leave.requests.manage'),
    validateId,
    validate('body', rescheduleLeaveSchema),
    (req, res) => controller.rescheduleRequest(req, res),
  );
  router.post(
    '/requests/:id/start',
    requirePermission('leave.requests.manage'),
    validateId,
    validate('body', versionOnlySchema),
    (req, res) => controller.startRequest(req, res),
  );
  router.post(
    '/requests/:id/interrupt',
    requirePermission('leave.requests.manage'),
    validateId,
    validate('body', interruptLeaveSchema),
    (req, res) => controller.interruptRequest(req, res),
  );
  router.post(
    '/requests/:id/complete',
    requirePermission('leave.requests.manage'),
    validateId,
    validate('body', completeLeaveSchema),
    (req, res) => controller.completeRequest(req, res),
  );
  router.patch(
    '/requests/:id',
    requirePermission('leave.requests.update'),
    validateId,
    validate('body', updateLeaveRequestSchema),
    (req, res) => controller.updateRequest(req, res),
  );
  router.get('/requests/:id', requirePermission('leave.requests.read'), validateId, (req, res) =>
    controller.getRequest(req, res),
  );

  // ----------------------------------------------------------
  // Planeamento
  // ----------------------------------------------------------

  router.get(
    '/planning/calendar',
    requirePermission('leave.planning.read'),
    validate('query', calendarQuerySchema),
    (req, res) => controller.calendar(req, res),
  );
  router.get(
    '/planning/conflicts',
    requirePermission('leave.planning.read'),
    validate('query', conflictQuerySchema),
    (req, res) => controller.conflicts(req, res),
  );
  router.get(
    '/planning/absences',
    requirePermission('leave.planning.read'),
    validate('query', absencesQuerySchema),
    (req, res) => controller.absences(req, res),
  );

  // ----------------------------------------------------------
  // Relatórios
  // ----------------------------------------------------------

  router.get(
    '/reports/balances',
    requirePermission('leave.reports.read'),
    validate('query', balancesQuerySchema),
    (req, res) => controller.balances(req, res),
  );
  router.get(
    '/reports/taken-days',
    requirePermission('leave.reports.read'),
    validate('query', takenDaysQuerySchema),
    (req, res) => controller.takenDays(req, res),
  );

  return router;
};
