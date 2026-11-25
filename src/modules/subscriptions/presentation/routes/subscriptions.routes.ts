import { NextFunction, Request, Response, Router, RequestHandler } from 'express';
import { SubscriptionsApplicationService } from '../../application/use-cases/subscriptions-application.service';
import {
  SUBSCRIPTION_METRICS,
  SUBSCRIPTION_PERMISSIONS as P,
} from '../../domain/subscription.types';
import { SubscriptionsController } from '../controllers/subscriptions.controller';
import { z } from 'zod';
import { idSchema, cancelSchema, createSubscriptionSchema, trialConversionSchema } from '../schemas/subscriptions.schema';
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
  const adminHandler = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
    (req, res, next) => { void Promise.resolve().then(() => fn(req, res)).catch(next); };
  admin.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  admin.get('/plans', adminHandler(c.adminPlans.bind(c)));
  admin.get('/features', adminHandler(c.adminFeatures.bind(c)));
  admin.get('/plans/compare', adminHandler(c.comparePlans.bind(c)));
  admin.get('/plans/:id', adminHandler(c.adminPlan.bind(c)));
  admin.get('/tenants/:tenantId/subscription', adminHandler(c.adminSubscription.bind(c)));
  admin.get('/tenants/:tenantId/trials', adminHandler(c.adminSubscription.bind(c)));
  admin.get('/tenants/:tenantId/change-requests/:id', adminHandler(c.adminChangeDetail.bind(c)));
  admin.get('/reports', adminHandler(c.report.bind(c)));
  admin.get('/subscriptions', adminHandler(c.adminList.bind(c)));
  admin.get('/policies', adminHandler(c.policy.bind(c)));
  admin.post('/plans', adminHandler(c.adminPlans.bind(c)));
  admin.post('/features', adminHandler(c.adminFeatures.bind(c)));
  admin.post('/plans/:id/versions', adminHandler(c.createPlanVersion.bind(c)));
  admin.post('/plans/:id/publish', adminHandler(c.publishPlan.bind(c)));
  admin.post('/plans/:id/archive', adminHandler(c.archivePlan.bind(c)));
  admin.post('/tenants/:tenantId/trials/extend', adminHandler(c.adminTrialExtend.bind(c)));
  admin.patch('/plans/:id', adminHandler(c.adminPlan.bind(c)));
  admin.put('/policies', adminHandler(c.policy.bind(c)));
  admin.post('/tenants/:tenantId/suspend', adminHandler((req, res) => c.adminStatus(req, res, 'SUSPENDED')));
  admin.post('/tenants/:tenantId/reactivate', adminHandler((req, res) => c.adminStatus(req, res, 'ACTIVE')));
  for (const [decision, approve] of [['approve', true], ['reject', false]] as const)
    admin.post('/tenants/:tenantId/change-requests/:id/' + decision, adminHandler((req, res) => c.adminChanges(req, res, approve)));
  const company = z.coerce.number().int().min(1).max(2147483647);
  admin.post('/tenants/:tenantId/subscriptions', adminHandler(async (req, res) => {
    const tenantId = company.parse(req.params.tenantId);
    res.status(201).json({ success: true, data: await s.adminCreateSubscription(tenantId,
      Number(req.user?.userId), createSubscriptionSchema.parse(req.body)) });
  }));
  admin.get('/tenants/:tenantId/records/:kind/:id', adminHandler(async (req, res) => {
    const { page, limit } = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(req.query);
    res.json({ success: true, data: await s.adminRecords(company.parse(req.params.tenantId),
      idSchema.parse(req.params.id), req.params.kind, page, limit) });
  }));
  admin.post('/tenants/:tenantId/subscriptions/:id/renew', adminHandler(async (req, res) => {
    res.status(202).json({ success: true, data: await s.requestRenewal(company.parse(req.params.tenantId),
      idSchema.parse(req.params.id), Number(req.user?.userId)) });
  }));
  admin.post('/tenants/:tenantId/subscriptions/:id/cancel', adminHandler(async (req, res) => {
    const input = cancelSchema.parse(req.body);
    res.json({ success: true, data: await s.cancel(company.parse(req.params.tenantId),
      Number(req.user?.userId), idSchema.parse(req.params.id), input.atPeriodEnd, input.reason) });
  }));
  admin.post('/tenants/:tenantId/subscriptions/:id/convert', adminHandler(async (req, res) => {
    const input = trialConversionSchema.parse(req.body);
    res.status(202).json({ success: true, data: await s.convertTrial(company.parse(req.params.tenantId),
      Number(req.user?.userId), idSchema.parse(req.params.id), input.planVersionId, input.interval) });
  }));
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
