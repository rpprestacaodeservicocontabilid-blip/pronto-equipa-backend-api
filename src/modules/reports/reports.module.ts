import { SequelizeReportStore } from './infrastructure/persistence/repositories/sequelize-report-store';
import { SequelizeReportSource } from './infrastructure/adapters/sequelize-report-source';
import { payrollPdf, payrollXlsx } from '../payroll/infrastructure/payroll-export';
import { SequelizeMembershipReader } from '../tenancy/infrastructure/persistence/readers/sequelize-membership.reader';
import { RequestHandler } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { ReportsApplicationService } from './application/use-cases/reports-application.service';
import { ReportsController } from './presentation/controllers/reports.controller';
import { createReportsRoutes } from './presentation/routes/reports.routes';
export interface ReportsModuleOptions {
  requirePermission: (permission: string) => RequestHandler;
  audit: AuditRecorderPort;
}
export function createReportsModule(options: ReportsModuleOptions) {
  const service = new ReportsApplicationService(
    options.audit,
    new SequelizeReportStore(),
    new SequelizeReportSource(),
    { pdf: payrollPdf, xlsx: payrollXlsx },
    new SequelizeMembershipReader(),
  );
  const controller = new ReportsController(service);
  return { routes: createReportsRoutes(controller, service, options.requirePermission) };
}
