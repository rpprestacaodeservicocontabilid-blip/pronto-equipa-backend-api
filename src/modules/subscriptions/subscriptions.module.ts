import { SequelizeSubscriptionPersistence } from './infrastructure/persistence/repositories/sequelize-subscription-persistence';
import { RequestHandler } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { SubscriptionsApplicationService } from './application/use-cases/subscriptions-application.service';
import { SubscriptionsRuntime } from './infrastructure/jobs/subscriptions-runtime';
import { SubscriptionsController } from './presentation/controllers/subscriptions.controller';
import { createSubscriptionsRoutes } from './presentation/routes/subscriptions.routes';
export function createSubscriptionsModule(options: {
  requirePermission: (permission: string) => RequestHandler;
  audit: AuditRecorderPort;
}) {
  const service = new SubscriptionsApplicationService(
    options.audit,
    new SequelizeSubscriptionPersistence(),
  );
  const controller = new SubscriptionsController(service);
  const runtime = new SubscriptionsRuntime(service);
  return {
    ...createSubscriptionsRoutes(controller, service, options.requirePermission),
    runtime,
    service,
  };
}
