import { SequelizeNotificationStore } from './infrastructure/persistence/repositories/sequelize-notification-store';
import { RequestHandler } from 'express';
import { NotificationDirectory } from './domain/notification';
import { NotificationsService } from './application/use-cases/notifications.service';
import { HttpNotificationProvider } from './infrastructure/http-notification.provider';
import { NotificationRuntime } from './infrastructure/jobs/notification-runtime';
import { createNotificationsRoutes } from './presentation/routes/notifications.routes';
export function createNotificationsModule(options: {
  directory: NotificationDirectory;
  guard: (permission: string) => RequestHandler;
}) {
  const service = new NotificationsService(
    options.directory,
    new HttpNotificationProvider(),
    new SequelizeNotificationStore(),
  );
  return {
    ...createNotificationsRoutes(service, options),
    service,
    runtime: new NotificationRuntime(service),
  };
}
