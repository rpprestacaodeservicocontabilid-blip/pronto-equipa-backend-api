import { Router } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { ManageAttendanceUseCase } from './application/use-cases/manage-attendance.use-case';
import { SequelizeAttendanceRepository } from './infrastructure/persistence/repositories/sequelize-attendance.repository';
import { AttendanceController } from './presentation/controllers/attendance.controller';
import { createAttendanceRoutes } from './presentation/routes/attendance.routes';

type Middleware = (
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) => void;

export interface AttendanceModuleOptions {
  requirePermission: (permission: string) => Middleware;
  audit: AuditRecorderPort;
}

export const createAttendanceModule = (options: AttendanceModuleOptions): { routes: Router } => {
  const repository = new SequelizeAttendanceRepository();
  const useCase = new ManageAttendanceUseCase(repository, options.audit);
  const controller = new AttendanceController(useCase);
  return { routes: createAttendanceRoutes(controller, options.requirePermission) };
};
