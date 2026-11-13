import { Router } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { ManageContractsUseCase } from './application/use-cases/manage-contracts.use-case';
import { SequelizeContractRepository } from './infrastructure/persistence/repositories/sequelize-contract.repository';
import { ContractsController } from './presentation/controllers/contracts.controller';
import { createContractsRoutes } from './presentation/routes/contracts.routes';

type Middleware = (
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) => void;

export interface ContractsModuleOptions {
  requirePermission: (permission: string) => Middleware;
  audit: AuditRecorderPort;
}

export const createContractsModule = (options: ContractsModuleOptions): { routes: Router } => {
  const repository = new SequelizeContractRepository();
  const useCase = new ManageContractsUseCase(repository, options.audit);
  const controller = new ContractsController(useCase);
  return { routes: createContractsRoutes(controller, options.requirePermission) };
};
