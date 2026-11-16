import { Router } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { ManageOrganizationUseCase } from './application/use-cases/manage-organization.use-case';
import { SequelizeOrganizationRepository } from './infrastructure/persistence/repositories/sequelize-organization.repository';
import { OrganizationController } from './presentation/controllers/organization.controller';
import { createOrganizationRoutes } from './presentation/routes/organization.routes';

type Middleware = (
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) => void;

export interface OrganizationModuleOptions {
  requirePermission: (permission: string) => Middleware;
  audit: AuditRecorderPort;
}

export const createOrganizationModule = (
  options: OrganizationModuleOptions,
): { routes: Router; service: ManageOrganizationUseCase } => {
  const repository = new SequelizeOrganizationRepository();
  const useCase = new ManageOrganizationUseCase(repository, options.audit);
  const controller = new OrganizationController(useCase);
  return {
    routes: createOrganizationRoutes(controller, options.requirePermission),
    service: useCase,
  };
};
