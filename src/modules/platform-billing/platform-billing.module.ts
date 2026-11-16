import { SequelizeBillingStore } from './infrastructure/persistence/repositories/sequelize-billing-store';
import { billingPdf } from './infrastructure/billing-pdf';
import { RequestHandler } from 'express';
import { BillingCommercialService } from './application/use-cases/billing-commercial.service';
import { BillingRuntime } from './infrastructure/jobs/billing-runtime';
import { createPlatformBillingRoutes } from './presentation/routes/platform-billing.routes';
export function createPlatformBillingModule(options: {
  requirePermission: (permission: string) => RequestHandler;
  applySubscriptionEvent?: (event: any) => Promise<any>;
  readSubscription?: (companyId: number) => Promise<any>;
}) {
  const service = new BillingCommercialService(
    new SequelizeBillingStore(),
    { render: billingPdf },
    { subscriptionTaxVersion: process.env.PLATFORM_BILLING_SUBSCRIPTION_TAX_VERSION },
  );
  return {
    ...createPlatformBillingRoutes(service, options),
    service,
    runtime: new BillingRuntime(service, options.applySubscriptionEvent, options.readSubscription),
  };
}
