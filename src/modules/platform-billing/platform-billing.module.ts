import { SequelizeBillingStore } from './infrastructure/persistence/repositories/sequelize-billing-store';
import { BillingAdminReader } from './infrastructure/persistence/billing-admin-reader';
import { registerBillingAdminReads } from './presentation/routes/billing-admin.routes';
import { billingPdf } from './infrastructure/billing-pdf';
import { RequestHandler } from 'express';
import { ForbiddenError } from '../../shared/errors/app.error';
import { BillingCommercialService } from './application/use-cases/billing-commercial.service';
import { BillingRuntime } from './infrastructure/jobs/billing-runtime';
import { createPlatformBillingRoutes } from './presentation/routes/platform-billing.routes';
export function createPlatformBillingModule(options: {
  requirePermission: (permission: string) => RequestHandler;
  isPlatformAdmin: (actor: number) => Promise<boolean>;
  authorizePlatform: (actor: number, permission: string) => Promise<boolean>;
  applySubscriptionEvent?: (event: any) => Promise<any>;
  readSubscription?: (companyId: number) => Promise<any>;
}) {
  const store = new SequelizeBillingStore();
  const service = new BillingCommercialService(
    store,
    { render: billingPdf },
    { subscriptionTaxVersion: process.env.PLATFORM_BILLING_SUBSCRIPTION_TAX_VERSION },
  );
  const requireAdmin = (permission: string): RequestHandler => async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const actor = req.user?.userId;
      if (!actor) { res.sendStatus(401); return; }
      if (!await options.isPlatformAdmin(actor) &&
        (permission === 'legacy:read' || !await options.authorizePlatform(actor, 'platform-billing:' + permission)))
        throw new ForbiddenError('Platform billing access denied.');
      next();
    } catch (error) { next(error); }
  };
  const routes = createPlatformBillingRoutes(service, { ...options, requireAdmin });
  registerBillingAdminReads(routes.adminRoutes, service, new BillingAdminReader(store), requireAdmin);
  return {
    ...routes,
    service,
    runtime: new BillingRuntime(service, options.applySubscriptionEvent, options.readSubscription),
  };
}
