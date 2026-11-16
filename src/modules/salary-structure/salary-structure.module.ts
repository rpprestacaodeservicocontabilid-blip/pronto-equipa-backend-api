import { Router } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { ManageSalaryStructureUseCase } from './application/use-cases/manage-salary-structure.use-case';
import { SequelizeSalaryStructureRepository } from './infrastructure/persistence/repositories/sequelize-salary-structure.repository';
import { SalaryStructureController } from './presentation/controllers/salary-structure.controller';
import { createSalaryStructureRoutes } from './presentation/routes/salary-structure.routes';

type Middleware = (
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) => void;

export interface SalaryStructureModuleOptions {
  requirePermission: (permission: string) => Middleware;
  audit: AuditRecorderPort;
}

export const createSalaryStructureModule = (
  options: SalaryStructureModuleOptions,
): { routes: Router; service: ManageSalaryStructureUseCase } => {
  const repository = new SequelizeSalaryStructureRepository();
  const useCase = new ManageSalaryStructureUseCase(repository, options.audit);
  const controller = new SalaryStructureController(useCase);
  return {
    routes: createSalaryStructureRoutes(controller, options.requirePermission),
    service: useCase,
  };
};
