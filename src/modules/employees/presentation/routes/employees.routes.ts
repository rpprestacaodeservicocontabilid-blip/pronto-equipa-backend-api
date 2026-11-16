import { NextFunction, Request, Response, Router } from 'express';
import { EmployeesController } from '../controllers/employees.controller';
import {
  changeEmployeeStatusSchema,
  createEmployeeSchema,
  addEmployeeDependentSchema,
  employeeBankAccountSchema,
  exportEmployeesSchema,
  importEmployeesSchema,
  employeeIdSchema,
  listEmployeesSchema,
  rehireEmployeeSchema,
  terminateEmployeeSchema,
  transferEmployeeSchema,
  updateEmployeePersonalInfoSchema,
  updateEmployeeSchema,
} from '../schemas/employee.schema';

type Middleware = (req: Request, res: Response, next: NextFunction) => void;
type Schema = { parse(value: unknown): unknown };

const validateBody =
  (schema: Schema): Middleware =>
  (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };

const validateQuery =
  (schema: Schema): Middleware =>
  (req, _res, next) => {
    try {
      req.query = schema.parse(req.query) as Request['query'];
      next();
    } catch (error) {
      next(error);
    }
  };

const validateId: Middleware = (req, _res, next) => {
  try {
    req.params.id = employeeIdSchema.parse(req.params.id);
    next();
  } catch (error) {
    next(error);
  }
};

export const createEmployeesRoutes = (
  controller: EmployeesController,
  requirePermission: (permission: string) => Middleware,
): Router => {
  const router = Router();

  router.get(
    '/',
    requirePermission('employees.read'),
    validateQuery(listEmployeesSchema),
    (req, res) => controller.list(req, res),
  );
  router.post(
    '/imports',
    requirePermission('employees.import'),
    requirePermission('employees.personal.manage'),
    validateBody(importEmployeesSchema),
    (req, res) => controller.import(req, res),
  );
  router.get(
    '/exports',
    requirePermission('employees.export'),
    validateQuery(exportEmployeesSchema),
    (req, res) => controller.export(req, res),
  );
  router.post(
    '/',
    requirePermission('employees.create'),
    requirePermission('employees.personal.manage'),
    validateBody(createEmployeeSchema),
    (req, res) => controller.create(req, res),
  );
  router.get(
    '/:id/dependents',
    requirePermission('employees.dependents.read'),
    validateId,
    (req, res) => controller.dependents(req, res),
  );
  router.post(
    '/:id/dependents',
    requirePermission('employees.dependents.manage'),
    validateId,
    validateBody(addEmployeeDependentSchema),
    (req, res) => controller.addEmployeeDependent(req, res),
  );
  router.get(
    '/:id/bank-account',
    requirePermission('employees.bank_accounts.read'),
    validateId,
    (req, res) => controller.employeeBankAccount(req, res),
  );
  router.put(
    '/:id/bank-account',
    requirePermission('employees.bank_accounts.manage'),
    validateId,
    validateBody(employeeBankAccountSchema),
    (req, res) => controller.updateEmployeeBankAccount(req, res),
  );
  router.get(
    '/:id/personal-info',
    requirePermission('employees.personal.read'),
    validateId,
    (req, res) => controller.getPersonalInfo(req, res),
  );
  router.patch(
    '/:id/personal-info',
    requirePermission('employees.personal.manage'),
    validateId,
    validateBody(updateEmployeePersonalInfoSchema),
    (req, res) => controller.updatePersonalInfo(req, res),
  );
  router.get('/:id/history', requirePermission('employees.history.read'), validateId, (req, res) =>
    controller.history(req, res),
  );
  router.patch(
    '/:id/status',
    requirePermission('employees.status.manage'),
    validateId,
    validateBody(changeEmployeeStatusSchema),
    (req, res) => controller.changeEmployeeStatus(req, res),
  );
  router.post(
    '/:id/transfers',
    requirePermission('employees.transfer'),
    validateId,
    validateBody(transferEmployeeSchema),
    (req, res) => controller.transfer(req, res),
  );
  router.post(
    '/:id/termination',
    requirePermission('employees.terminate'),
    validateId,
    validateBody(terminateEmployeeSchema),
    (req, res) => {
      req.body = { ...terminateEmployeeSchema.parse(req.body), status: 'TERMINATED' };
      return controller.changeEmployeeStatus(req, res);
    },
  );
  router.post(
    '/:id/rehire',
    requirePermission('employees.rehire'),
    validateId,
    validateBody(rehireEmployeeSchema),
    (req, res) => {
      req.body = { ...rehireEmployeeSchema.parse(req.body), status: 'ACTIVE' };
      return controller.changeEmployeeStatus(req, res);
    },
  );
  router.get('/:id', requirePermission('employees.read'), validateId, (req, res) =>
    controller.get(req, res),
  );
  router.patch(
    '/:id',
    requirePermission('employees.update'),
    validateId,
    validateBody(updateEmployeeSchema),
    (req, res) => controller.update(req, res),
  );

  return router;
};
