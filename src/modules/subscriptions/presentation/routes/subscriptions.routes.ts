import { NextFunction, Request, Response, Router } from 'express';
import { SubscriptionsApplicationService } from '../../application/use-cases/subscriptions-application.service';
import {
  SUBSCRIPTION_METRICS,
  SUBSCRIPTION_PERMISSIONS as P,
} from '../../domain/subscription.types';
import { SubscriptionsController } from '../controllers/subscriptions.controller';
import { idSchema } from '../schemas/subscriptions.schema';
type Guard = (permission: string) => (req: Request, res: Response, next: NextFunction) => void;
const validateId = (req: Request, res: Response, next: NextFunction) => {
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(400).json({ success: false, message: 'Identificador UUID inválido.' });
    return;
  }
  next();
};
const metric = (req: Request, res: Response, next: NextFunction) => {
  if (!SUBSCRIPTION_METRICS.includes(req.params.metricCode as any)) {
    res.status(400).json({ success: false, message: 'Métrica não suportada.' });
    return;
  }
  next();
};
export const createSubscriptionsRoutes = (
  c: SubscriptionsController,
  s: SubscriptionsApplicationService,
  guard: Guard,
) => {
  const tenant = Router();
  tenant.get('/plans', guard(P.plansRead), c.plans.bind(c));
  tenant.get('/plans/compare', guard(P.plansRead), c.comparePlans.bind(c));
  tenant.get('/current', guard(P.tenantRead), c.current.bind(c));
  tenant.post('/', guard(P.tenantCreate), c.createSubscription.bind(c));
  tenant.post('/:id/cancel', guard(P.tenantCancel), validateId, c.cancel.bind(c));
  tenant.post('/:id/reactivate', guard(P.tenantReactivate), validateId, c.reactivate.bind(c));
  tenant.post('/:id/renew', guard(P.tenantRead), validateId, c.renewal.bind(c));
  tenant.post('/:id/trial/convert', guard(P.tenantCreate), validateId, c.convertTrial.bind(c));
  tenant.get('/:id/history', guard(P.historyRead), validateId, c.history.bind(c));
  tenant.get('/:id/periods', guard(P.tenantRead), validateId, c.periods.bind(c));
  tenant.get('/change-requests', guard(P.changesRead), c.changes.bind(c));
  tenant.post('/change-requests', guard(P.changesCreate), c.changes.bind(c));
  tenant.get('/change-requests/:id', guard(P.changesRead), validateId, c.change.bind(c));
  tenant.get('/entitlements', guard(P.entitlementsRead), c.entitlements.bind(c));
  tenant.get('/entitlements/:featureCode', guard(P.entitlementsRead), c.feature.bind(c));
  tenant.get('/limits', guard(P.limitsRead), c.entitlements.bind(c));
  tenant.get('/limits/:metricCode', guard(P.limitsRead), metric, c.limit.bind(c));
  tenant.get('/usage', guard(P.usageRead), c.usage.bind(c));
  tenant.get('/usage/:metricCode', guard(P.usageRead), metric, c.usage.bind(c));
  tenant.get('/alerts', guard(P.tenantRead), c.alerts.bind(c));
  const admin = Router();
  admin.get('/plans', c.adminPlans.bind(c));
  admin.post('/plans', c.adminPlans.bind(c));
  admin.get('/features', c.adminFeatures.bind(c));
  admin.post('/features', c.adminFeatures.bind(c));
  admin.get('/plans/compare', c.comparePlans.bind(c));
  admin.get('/plans/:id', c.adminPlan.bind(c));
  admin.patch('/plans/:id', c.adminPlan.bind(c));
  admin.post('/plans/:id/versions', c.createPlanVersion.bind(c));
  admin.post('/plans/:id/publish', c.publishPlan.bind(c));
  admin.post('/plans/:id/archive', c.archivePlan.bind(c));
  admin.get('/tenants/:tenantId/subscription', c.adminSubscription.bind(c));
  admin.get('/tenants/:tenantId/trials', c.adminSubscription.bind(c));
  admin.post('/tenants/:tenantId/trials/extend', c.adminTrialExtend.bind(c));
  admin.post('/tenants/:tenantId/suspend', (req, res) => c.adminStatus(req, res, 'SUSPENDED'));
  admin.post('/tenants/:tenantId/reactivate', (req, res) => c.adminStatus(req, res, 'ACTIVE'));
  admin.post('/tenants/:tenantId/overrides', c.adminOverride.bind(c));
  admin.get('/tenants/:tenantId/change-requests/:id', validateId, c.adminChangeDetail.bind(c));
  admin.post('/tenants/:tenantId/change-requests/:id/approve', validateId, (req, res) =>
    c.adminChanges(req, res, true),
  );
  admin.post('/tenants/:tenantId/change-requests/:id/reject', validateId, (req, res) =>
    c.adminChanges(req, res, false),
  );
  admin.get('/reports', c.report.bind(c));
  admin.get('/subscriptions', c.adminList.bind(c));
  admin.get('/policies', c.policy.bind(c));
  admin.put('/policies', c.policy.bind(c));
  const integration = Router();
  integration.post('/billing-events', c.billingEvent.bind(c));
  const contracts = {
    checkFeature: ({ tenantId, featureCode }: { tenantId: string; featureCode: string }) =>
      s.checkFeature(Number(tenantId), featureCode),
    getLimit: ({ tenantId, metricCode }: { tenantId: string; metricCode: string }) =>
      s.getLimit(Number(tenantId), metricCode),
  };
  const usage = {
    reserve: ({
      tenantId,
      metricCode,
      quantity,
      operationKey,
    }: {
      tenantId: string;
      metricCode: string;
      quantity: string;
      operationKey: string;
    }) => s.reserve(Number(tenantId), { metricCode, quantity, operationKey }),
    commit: async ({ tenantId, reservationId }: { tenantId: string; reservationId: string }) => {
      await s.settleReservation(Number(tenantId), reservationId, true);
    },
    release: async ({ tenantId, reservationId }: { tenantId: string; reservationId: string }) => {
      await s.settleReservation(Number(tenantId), reservationId, false);
    },
  };
  return {
    routes: tenant,
    adminRoutes: admin,
    integrationRoutes: integration,
    service: s,
    entitlements: contracts,
    usage,
  };
};
