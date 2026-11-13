import { Router } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { ManageLoansUseCase } from './application/use-cases/manage-loans.use-case';
import { SequelizeLoansRepository } from './infrastructure/persistence/repositories/sequelize-loans.repository';
import { LoansController } from './presentation/controllers/loans.controller';
import { createLoansRoutes } from './presentation/routes/loans.routes';

type Middleware = (
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) => void;

export interface LoansModuleOptions {
  requirePermission: (permission: string) => Middleware;
  audit: AuditRecorderPort;
}

export const createLoansModule = (options: LoansModuleOptions): { routes: Router } => {
  const repository = new SequelizeLoansRepository();
  const useCase = new ManageLoansUseCase(repository, options.audit);
  const controller = new LoansController(useCase);
  return { routes: createLoansRoutes(controller, options.requirePermission) };
};
