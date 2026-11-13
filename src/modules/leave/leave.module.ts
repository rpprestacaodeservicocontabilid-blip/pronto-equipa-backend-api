import { Router } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import type { IdempotencyStore } from '../../shared/application/idempotency';
import { InMemoryIdempotencyStore } from '../../shared/infrastructure/in-memory-idempotency-store';
import { LeaveReportsUseCase } from './application/use-cases/leave-reports.use-case';
import { ManageLeaveAccountsUseCase } from './application/use-cases/manage-leave-accounts.use-case';
import { ManageLeavePlanningUseCase } from './application/use-cases/manage-leave-planning.use-case';
import { ManageLeaveRequestsUseCase } from './application/use-cases/manage-leave-requests.use-case';
import { SequelizeEmployeeReader } from './infrastructure/adapters/sequelize-employee-reader';
import { SequelizeContractReader } from './infrastructure/adapters/sequelize-contract-reader';
import { SequelizeWorkCalendarReader } from './infrastructure/adapters/sequelize-work-calendar-reader';
import { SequelizeLeaveRepository } from './infrastructure/persistence/repositories/sequelize-leave.repository';
import { SequelizeLeaveWorkUnit } from './infrastructure/persistence/repositories/sequelize-leave-work-unit';
import { LeaveController } from './presentation/controllers/leave.controller';
import { createLeaveRoutes } from './presentation/routes/leave.routes';

type Middleware = (
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) => void;

export interface LeaveModuleOptions {
  /** Verificador de permissões injectado pela composition root. */
  requirePermission: (permission: string) => Middleware;
  /** Gravador de auditoria best-effort (módulo `audit`). */
  audit: AuditRecorderPort;
  /**
   * Permite auto-aprovação (criador = aprovador). FALSO por
   * omissão — a política anti-auto-aprovação (CA-030) fica
   * activa; só uma decisão explícita do product owner a levanta.
   */
  allowSelfApproval?: boolean;
  /** Store de idempotência — omissão: em memória (dev/teste). */
  idempotency?: IdempotencyStore;
}

/**
 * Factory do módulo `leave`.
 *
 * Composição das quatro camadas:
 *   domain (portas) ← application (casos de uso) ←
 *   infrastructure (adaptadores Sequelize) ← presentation (rotas).
 *
 * Montado na composition root (`main/routes.ts`) sob
 * `/api/v1/leave` com `authenticate` + `authz.tenantContext`.
 */
export const createLeaveModule = (options: LeaveModuleOptions): { routes: Router } => {
  const repository = new SequelizeLeaveRepository();
  const workUnit = new SequelizeLeaveWorkUnit();
  const employees = new SequelizeEmployeeReader();
  const contracts = new SequelizeContractReader();
  const calendars = new SequelizeWorkCalendarReader();
  const idempotency = options.idempotency ?? new InMemoryIdempotencyStore();

  const accounts = new ManageLeaveAccountsUseCase(
    repository,
    workUnit,
    employees,
    options.audit,
  );
  const requests = new ManageLeaveRequestsUseCase(
    repository,
    workUnit,
    employees,
    contracts,
    calendars,
    options.audit,
    idempotency,
    options.allowSelfApproval ?? false,
  );
  const planning = new ManageLeavePlanningUseCase(repository, calendars);
  const reports = new LeaveReportsUseCase(repository);

  const controller = new LeaveController(accounts, requests, planning, reports);

  return { routes: createLeaveRoutes(controller, options.requirePermission) };
};
