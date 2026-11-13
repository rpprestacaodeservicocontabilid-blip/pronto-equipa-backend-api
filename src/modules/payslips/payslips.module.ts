import { RequestHandler } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { PayslipsApplicationService } from './application/use-cases/payslips-application.service';
import { PayslipsController } from './presentation/controllers/payslips.controller';
import { createPayslipsRoutes } from './presentation/routes/payslips.routes';
import { PayslipsRuntime } from './infrastructure/jobs/payslips-runtime';
import { S3PayslipStorage } from './infrastructure/s3-payslip-storage.adapter';
import { FileSystemPayslipStorage } from './infrastructure/document-storage.adapter';

export interface PayslipsModuleOptions {
  requirePermission: (permission: string) => RequestHandler;
  audit: AuditRecorderPort;
}

export function createPayslipsModule(options: PayslipsModuleOptions) {
  const storage = process.env.PAYSLIPS_S3_ENDPOINT ? new S3PayslipStorage() : new FileSystemPayslipStorage();
  const service = new PayslipsApplicationService(options.audit, storage);
  const controller = new PayslipsController(service);
  const runtime = new PayslipsRuntime(service);

  return {
    routes: createPayslipsRoutes(controller, options.requirePermission),
    runtime,
  };
}
