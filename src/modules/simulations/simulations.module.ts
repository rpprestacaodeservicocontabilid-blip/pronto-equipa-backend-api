import { SequelizeSimulationPersistence } from './infrastructure/persistence/repositories/sequelize-simulation-persistence';
import { payrollPdf, payrollXlsx } from '../payroll/infrastructure/payroll-export';
import { RequestHandler } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { PayrollCalculatorAdapter } from '../payroll-engine/infrastructure/adapters/payroll-calculator.adapter';
import {
  HttpPayrollLegalRules,
  SequelizePayrollSourceReader,
} from '../payroll/infrastructure/adapters/payroll-integrations.adapter';
import { SimulationsApplicationService } from './application/use-cases/simulations-application.service';
import { SimulationsController } from './presentation/controllers/simulations.controller';
import { createSimulationsRoutes } from './presentation/routes/simulations.routes';
import { SequelizeSimulationSources } from './infrastructure/simulation-sources.adapter';
import { SimulationsRuntime } from './infrastructure/jobs/simulations-runtime';
export interface SimulationsModuleOptions {
  requirePermission: (permission: string) => RequestHandler;
  audit: AuditRecorderPort;
}
export function createSimulationsModule(options: SimulationsModuleOptions) {
  const source = new SequelizeSimulationSources(
    new SequelizePayrollSourceReader(new HttpPayrollLegalRules()),
  );
  const calculator = new PayrollCalculatorAdapter();
  const service = new SimulationsApplicationService(
    source,
    calculator,
    options.audit,
    new SequelizeSimulationPersistence(),
    { pdf: payrollPdf, xlsx: payrollXlsx },
  );
  const controller = new SimulationsController(service);
  const runtime = new SimulationsRuntime(service);
  return {
    routes: createSimulationsRoutes(controller, service, options.requirePermission),
    runtime,
  };
}
