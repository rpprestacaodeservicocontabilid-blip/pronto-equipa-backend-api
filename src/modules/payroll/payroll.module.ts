import { RequestHandler } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { PayrollWorkflowService } from './application/use-cases/payroll-workflow.service';
import { defaultPayrollService } from './infrastructure/jobs/payroll-runtime';
import { createPayrollRoutes } from './presentation/routes/payroll.routes';

export function createPayrollModule(options: {
  requirePermission: (permission: string) => RequestHandler;
  audit: AuditRecorderPort;
  service?: PayrollWorkflowService;
}) {
  return createPayrollRoutes({ ...options, service: options.service ?? defaultPayrollService() });
}
