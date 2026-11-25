import { SequelizeCompanyAccessDirectory } from '../persistence/readers/sequelize-company-access-directory';
import { Router } from 'express';

import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import {
  createAuditRecorder,
  createAuditRoutes,
} from '../../../audit/infrastructure/bootstrap/audit.bootstrap';

import { SequelizeCompanyRepository } from '../persistence/repositories/sequelize-company.repository';
import { SequelizeCompanyMemberRepository } from '../persistence/repositories/sequelize-company-member.repository';
import { SequelizeCompanyRoleRepository } from '../persistence/repositories/sequelize-company-role.repository';
import { SequelizeCompanyReader } from '../persistence/readers/sequelize-company.reader';
import { SequelizeMembershipReader } from '../persistence/readers/sequelize-membership.reader';

import { CompanyReaderPort } from '../../application/ports/company-reader.port';
import { MembershipReaderPort } from '../../application/ports/membership-reader.port';

import { CreateCompanyUseCase } from '../../application/use-cases/create-company.use-case';
import { ListMyCompaniesUseCase } from '../../application/use-cases/list-my-companies.use-case';
import { ListAllCompaniesUseCase } from '../../application/use-cases/list-all-companies.use-case';
import { GetCompanyContextUseCase } from '../../application/use-cases/get-company-context.use-case';
import { UpdateCompanyUseCase } from '../../application/use-cases/update-company.use-case';
import { ChangeCompanyStatusUseCase } from '../../application/use-cases/change-company-status.use-case';
import { ListMembersUseCase } from '../../application/use-cases/list-members.use-case';
import { AddMemberUseCase } from '../../application/use-cases/add-member.use-case';
import { UpdateMemberUseCase } from '../../application/use-cases/update-member.use-case';
import { RemoveMemberUseCase } from '../../application/use-cases/remove-member.use-case';
import { ListCompanyRolesUseCase } from '../../application/use-cases/list-company-roles.use-case';
import { CreateCompanyRoleUseCase } from '../../application/use-cases/create-company-role.use-case';
import { UpdateCompanyRoleUseCase } from '../../application/use-cases/update-company-role.use-case';
import { DeleteCompanyRoleUseCase } from '../../application/use-cases/delete-company-role.use-case';
import { SetCompanyRolePermissionsUseCase } from '../../application/use-cases/set-company-role-permissions.use-case';

import { CompanyController } from '../../presentation/controllers/company.controller';
import { MemberController } from '../../presentation/controllers/member.controller';
import { RoleController } from '../../presentation/controllers/role.controller';
import {
  createCompanyRoutes,
  createPlatformCompanyRoutes,
} from '../../presentation/routes/company.routes';
import { createCompanyScopedRoutes } from '../../presentation/routes/company-scoped.routes';

import '../persistence/associations';

type Middleware = (
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) => void;

export interface TenancyModuleOptions {
  /** Verificador contextual de permissão (módulo authorization). */
  requirePermission: (permission: string) => Middleware;
  /** Auditoria best-effort partilhada (módulo audit). */
  audit?: AuditRecorderPort;
}

export interface TenancyModule {
  /** `POST/GET /api/v1/companies` — sem tenant. */
  companyRoutes: Router;
  /** `GET/PATCH /api/v1/company*` + membros + papéis — com tenant. */
  companyScopedRoutes: Router;
  /** `/api/v1/platform/companies*` — com role de plataforma. */
  platformCompanyRoutes: Router;
  /** `GET /api/v1/company/audit-logs` — com tenant + audit.read. */
  auditRoutes: Router;
  /** Contratos para o módulo authorization. */
  readers: {
    companyReader: CompanyReaderPort;
    membershipReader: MembershipReaderPort;
  };
  auditRecorder: AuditRecorderPort;
}

/**
 * Composition root do módulo tenancy (empresas, membros, papéis).
 */
export const createTenancyModule = (options: TenancyModuleOptions): TenancyModule => {
  const audit = options.audit ?? createAuditRecorder();

  // ============================================================
  // REPOSITÓRIOS & READERS
  // ============================================================

  const companyRepository = new SequelizeCompanyRepository();
  const memberRepository = new SequelizeCompanyMemberRepository();
  const roleRepository = new SequelizeCompanyRoleRepository();

  const companyReader = new SequelizeCompanyReader();
  const membershipReader = new SequelizeMembershipReader();

  // ============================================================
  // USE CASES — EMPRESA
  // ============================================================

  const createCompanyUseCase = new CreateCompanyUseCase(
    companyRepository,
    memberRepository,
    audit,
    new SequelizeCompanyAccessDirectory(),
  );

  const listMyCompaniesUseCase = new ListMyCompaniesUseCase(companyRepository);

  const listAllCompaniesUseCase = new ListAllCompaniesUseCase(companyRepository);

  const getCompanyContextUseCase = new GetCompanyContextUseCase(
    companyRepository,
    membershipReader,
  );

  const updateCompanyUseCase = new UpdateCompanyUseCase(companyRepository, audit);

  const changeCompanyStatusUseCase = new ChangeCompanyStatusUseCase(companyRepository, audit);

  // ============================================================
  // USE CASES — MEMBROS
  // ============================================================

  const listMembersUseCase = new ListMembersUseCase(memberRepository);

  const addMemberUseCase = new AddMemberUseCase(
    memberRepository,
    audit,
    new SequelizeCompanyAccessDirectory(),
  );

  const updateMemberUseCase = new UpdateMemberUseCase(
    memberRepository,
    audit,
    new SequelizeCompanyAccessDirectory(),
  );

  const removeMemberUseCase = new RemoveMemberUseCase(
    memberRepository,
    audit,
    new SequelizeCompanyAccessDirectory(),
  );

  // ============================================================
  // USE CASES — PAPÉIS
  // ============================================================

  const listCompanyRolesUseCase = new ListCompanyRolesUseCase(roleRepository);

  const createCompanyRoleUseCase = new CreateCompanyRoleUseCase(roleRepository, audit);

  const updateCompanyRoleUseCase = new UpdateCompanyRoleUseCase(roleRepository, audit);

  const deleteCompanyRoleUseCase = new DeleteCompanyRoleUseCase(roleRepository, audit);

  const setCompanyRolePermissionsUseCase = new SetCompanyRolePermissionsUseCase(
    roleRepository,
    audit,
  );

  // ============================================================
  // CONTROLLERS
  // ============================================================

  const companyController = new CompanyController(
    createCompanyUseCase,
    listMyCompaniesUseCase,
    listAllCompaniesUseCase,
    getCompanyContextUseCase,
    updateCompanyUseCase,
    changeCompanyStatusUseCase,
    listMembersUseCase,
  );

  const memberController = new MemberController(
    listMembersUseCase,
    addMemberUseCase,
    updateMemberUseCase,
    removeMemberUseCase,
  );

  const roleController = new RoleController(
    listCompanyRolesUseCase,
    createCompanyRoleUseCase,
    updateCompanyRoleUseCase,
    deleteCompanyRoleUseCase,
    setCompanyRolePermissionsUseCase,
  );

  // ============================================================
  // ROTAS
  // ============================================================

  const companyRoutes = createCompanyRoutes(companyController);

  const companyScopedRoutes = createCompanyScopedRoutes({
    companyController,
    memberController,
    roleController,
    requirePermission: options.requirePermission,
  });

  const platformCompanyRoutes = createPlatformCompanyRoutes(companyController);

  const auditRoutes = createAuditRoutes({
    requirePermission: options.requirePermission('audit.read'),
  });

  return {
    companyRoutes,
    companyScopedRoutes,
    platformCompanyRoutes,
    auditRoutes,
    readers: {
      companyReader,
      membershipReader,
    },
    auditRecorder: audit,
  };
};
