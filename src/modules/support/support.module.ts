import { RequestHandler } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { DocumentsApplicationService } from '../documents/application/use-cases/documents-application.service';
import { NotificationsService } from '../notifications/application/use-cases/notifications.service';
import { SubscriptionsApplicationService } from '../subscriptions/application/use-cases/subscriptions-application.service';
import { SupportApplicationService } from './application/use-cases/support-application.service';
import { SupportDocumentAdapter } from './infrastructure/adapters/document.adapter';
import { SupportNotificationAdapter } from './infrastructure/adapters/notification.adapter';
import { SubscriptionEntitlementAdapter } from './infrastructure/adapters/subscription-entitlement.adapter';
import { SequelizeSupportStore } from './infrastructure/persistence/repositories/sequelize-support-store';
import { SupportRuntime } from './infrastructure/jobs/support-runtime';
import { createSupportRoutes } from './presentation/routes/support.routes';

export function createSupportModule(options: {
  requirePermission: (permission: string) => RequestHandler;
  audit: AuditRecorderPort;
  notifications: NotificationsService;
  subscriptions: SubscriptionsApplicationService;
  documents: DocumentsApplicationService;
}) {
  const service = new SupportApplicationService(
    new SequelizeSupportStore(),
    options.audit,
    new SubscriptionEntitlementAdapter((companyId) =>
      options.subscriptions.billingContract(companyId),
    ),
    new SupportNotificationAdapter(options.notifications),
    new SupportDocumentAdapter((companyId, id) => options.documents.get(companyId, id)),
  );
  return {
    ...createSupportRoutes(service, options.requirePermission),
    service,
    runtime: new SupportRuntime(service),
  };
}
