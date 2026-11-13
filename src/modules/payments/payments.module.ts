import { RequestHandler } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { PaymentsApplicationService } from './application/use-cases/payments-application.service';
import { PaymentsController } from './presentation/controllers/payments.controller';
import { createPaymentsRoutes } from './presentation/routes/payments.routes';
import { PaymentProviderPort } from './application/ports/payment-provider.port';
import { PreparedPayrollInstructionsHandler } from './application/handlers/prepared-payroll-instructions.handler';
import { PaymentsOutboxRuntime } from './infrastructure/payments-outbox.runtime';

export interface PaymentsModuleOptions {
  requirePermission: (permission: string) => RequestHandler;
  audit: AuditRecorderPort;
  /** Only real bank or payment adapters should be injected here. */
  providerAdapters?: readonly PaymentProviderPort[];
}

export function createPaymentsModule(options: PaymentsModuleOptions) {
  const service = new PaymentsApplicationService(options.audit, options.providerAdapters ?? []);
  const controller = new PaymentsController(service);
  const preparedPayrollInstructionsHandler = new PreparedPayrollInstructionsHandler(service);
  const outboxRuntime = new PaymentsOutboxRuntime(preparedPayrollInstructionsHandler);

  return {
    routes: createPaymentsRoutes(controller, options.requirePermission),
    service,
    preparedPayrollInstructionsHandler,
    outboxRuntime,
  };
}
