import { RequestHandler } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { ReportsApplicationService } from './application/reports-application.service';
import { ReportsController } from './presentation/controllers/reports.controller';
import { createReportsRoutes } from './presentation/routes/reports.routes';
export interface ReportsModuleOptions {
  requirePermission: (permission: string) => RequestHandler;
  audit: AuditRecorderPort;
}
export function createReportsModule(options: ReportsModuleOptions) {
  const service = new ReportsApplicationService(options.audit);
  const controller = new ReportsController(service);
  return { routes: createReportsRoutes(controller, service, options.requirePermission) };
}
