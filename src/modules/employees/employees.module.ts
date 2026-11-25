import type { TransactionalAuditPort } from '../audit/application/ports/audit-engine.ports';
import { z } from 'zod';
import { createEmployeeSchema } from './presentation/schemas/employee.schema';
import { EmployeeEntity } from './domain/entities/employee.entity';

import { Router } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { ChangeEmployeeStatusUseCase } from './application/use-cases/change-employee-status.use-case';
import { CreateEmployeeUseCase } from './application/use-cases/create-employee.use-case';
import { GetEmployeeHistoryUseCase } from './application/use-cases/get-employee-history.use-case';
import { GetEmployeeUseCase } from './application/use-cases/get-employee.use-case';
import { ListEmployeesUseCase } from './application/use-cases/list-employees.use-case';
import { TransferEmployeeUseCase } from './application/use-cases/transfer-employee.use-case';
import { UpdateEmployeeUseCase } from './application/use-cases/update-employee.use-case';
import {
  AddEmployeeDependentUseCase,
  GetEmployeeBankAccountUseCase,
  ListEmployeeDependentsUseCase,
  SetEmployeeBankAccountUseCase,
} from './application/use-cases/manage-employee-details.use-cases';
import {
  ExportEmployeesUseCase,
  ImportEmployeesUseCase,
} from './application/use-cases/import-export-employees.use-cases';
import { SequelizeEmployeeRepository } from './infrastructure/persistence/repositories/sequelize-employee.repository';
import { SequelizeEmployeeDetailsRepository } from './infrastructure/persistence/repositories/sequelize-employee-details.repository';
import { EmployeesController } from './presentation/controllers/employees.controller';
import { createEmployeesRoutes } from './presentation/routes/employees.routes';
import { createEmployeeAdministrationRoutes } from './presentation/routes/employee-administration.routes';
import { EmployeeAdministrationRepository } from './infrastructure/persistence/repositories/employee-administration.repository';

const initialEmployeeSchema = createEmployeeSchema.extend({ id: z.string().uuid() });

type Middleware = (
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) => void;

export interface EmployeesModuleOptions {
  requirePermission: (permission: string) => Middleware;
  audit: AuditRecorderPort;
  transactionalAudit: TransactionalAuditPort;
}

export interface EmployeesModule {
  routes: Router;
  importInitial(companyId: number, actor: number, input: unknown): Promise<EmployeeEntity>;
}

export const createEmployeesModule = (options: EmployeesModuleOptions): EmployeesModule => {
  const repository = new SequelizeEmployeeRepository(options.transactionalAudit);
  const detailsRepository = new SequelizeEmployeeDetailsRepository();
  const createEmployee = new CreateEmployeeUseCase(repository, options.audit);
  const controller = new EmployeesController(
    createEmployee,
    new ListEmployeesUseCase(repository),
    new GetEmployeeUseCase(repository),
    new UpdateEmployeeUseCase(repository, options.audit),
    new ChangeEmployeeStatusUseCase(repository),
    new TransferEmployeeUseCase(repository, options.audit),
    new GetEmployeeHistoryUseCase(repository),
    new ListEmployeeDependentsUseCase(detailsRepository),
    new AddEmployeeDependentUseCase(detailsRepository, options.audit),
    new GetEmployeeBankAccountUseCase(detailsRepository),
    new SetEmployeeBankAccountUseCase(detailsRepository, options.audit),
    new ImportEmployeesUseCase(createEmployee, options.audit),
    new ExportEmployeesUseCase(repository, options.audit),
  );

  return {
    async importInitial(companyId, actor, input) {
      const parsed = initialEmployeeSchema.parse(input);
      const old = await repository.findById(companyId, parsed.id);
      return old || createEmployee.execute({ ...parsed, companyId, actorUserId: actor });
    },
    routes: Router().use(
      createEmployeeAdministrationRoutes(new EmployeeAdministrationRepository(repository), options.requirePermission, options.audit),
      createEmployeesRoutes(controller, options.requirePermission),
    ),
  };
};
