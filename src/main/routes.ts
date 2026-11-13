import { Router } from 'express';

// ============================================================
// AUTH (identidade) — legado existente
// ============================================================

import {
  createAuthRoutes,
  createOAuthRoutes,
  createSessionRoutes,
} from '../modules/auth/infrastructure/bootstrap/auth.bootstrap';
import { createAuthorizationCheckRoutes } from '../modules/auth/infrastructure/bootstrap/authorization-check.bootstrap';
import { authenticationMiddleware } from '../modules/auth/infrastructure/http/middleware/authentication.middleware';
import { JwtTokenService } from '../modules/auth/infrastructure/service/jwt-token.service';

// ============================================================
// USER (identidade) — legado existente
// ============================================================

import { UserModule } from '../modules/user/user.module';
import { createUserRecentRoutes } from '../modules/user/infrastructure/http/routes/user-recent.routes';
import { AuthGatewayImpl } from '../modules/user/infrastructure/integrations/auth/auth.gateway.impl';
import { StorageGatewayImpl } from '../modules/user/infrastructure/integrations/storage/storage.gateway.impl';
import { NotificationGatewayImpl } from '../modules/user/infrastructure/integrations/notifications/notification.gateway.impl';

// ============================================================
// FASE 1 — TENANCY / AUTHORIZATION / AUDIT
// ============================================================

import { createTenancyModule } from '../modules/tenancy/infrastructure/bootstrap/tenancy.bootstrap';
import { createAuthorization } from '../modules/authorization/infrastructure/bootstrap/authorization.bootstrap';
import { SequelizeMembershipReader } from '../modules/tenancy/infrastructure/persistence/readers/sequelize-membership.reader';
import { createEmployeesModule } from '../modules/employees/employees.module';
import { createContractsModule } from '../modules/contracts/contracts.module';
import { createOrganizationModule } from '../modules/organization/organization.module';
import { createLeaveModule } from '../modules/leave/leave.module';
import { createAttendanceModule } from '../modules/attendance/attendance.module';
import { createLoansModule } from '../modules/loans/loans.module';
import { createSalaryStructureModule } from '../modules/salary-structure/salary-structure.module';
import { createPayrollModule } from '../modules/payroll/payroll.module';
import { createPaymentsModule } from '../modules/payments/payments.module';
import { createPayslipsModule } from '../modules/payslips/payslips.module';
import { createLegalRulesModule } from '../modules/legal-rules/legal-rules.module';
import { createReportsModule } from '../modules/reports/reports.module';

import { ENV } from '../config/env';

/**
 * ============================================================
 * COMPOSITION ROOT
 * ============================================================
 *
 * Estrutura de acesso da Fase 1 (Fundação):
 *
 *   /api/v1/auth        autenticação (público)
 *   /api/v1/oauth       federated login (público)
 *   /api/v1/sessions    sessões do utilizador (autenticado)
 *   /api/v1/authorization  verificação global de permissões
 *   /api/v1/users       gestão de utilizadores (legado)
 *   /api/v1/companies   empresas do utilizador (autenticado)
 *   /api/v1/company     contexto de empresa (autenticado + tenant)
 *   /api/v1/platform    administração de plataforma (SUPER_ADMIN)
 *   /health             infraestrutura
 *
 * Camadas de acesso, por ordem:
 *
 *   Identidade (JWT) → Contexto empresarial (tenant) → Permissão
 */

const router = Router();

/** Serviço JWT partilhado pelas rotas autenticadas. */
const tokenService = new JwtTokenService(ENV.JWT.SECRET, ENV.JWT.EXPIRES_IN || '15m');

/** Autenticação obrigatória (popula `req.user` a partir do JWT). */
const authenticate = authenticationMiddleware(tokenService);

// ============================================================
// FASE 1 — MÓDULOS DE FUNDACÇÃO
// ============================================================

const membershipReader = new SequelizeMembershipReader();

const authz = createAuthorization({ membershipReader });

const tenancy = createTenancyModule({
  requirePermission: authz.requirePermission,
});
const employees = createEmployeesModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
});
const contracts = createContractsModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
});
const organization = createOrganizationModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
});
const leave = createLeaveModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
});
const attendance = createAttendanceModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
});
const loans = createLoansModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
});
const salaryStructure = createSalaryStructureModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
});
const payroll = createPayrollModule({ requirePermission: authz.requirePermission, audit: tenancy.auditRecorder });
export const payments = createPaymentsModule({ requirePermission: authz.requirePermission, audit: tenancy.auditRecorder });
export const payslips = createPayslipsModule({ requirePermission: authz.requirePermission, audit: tenancy.auditRecorder });
const legalRules = createLegalRulesModule({ authorization: authz.authorizationService, audit: tenancy.auditRecorder });
const reports = createReportsModule({ requirePermission: authz.requirePermission, audit: tenancy.auditRecorder });

/**
 * ============================================================
 * HEALTH CHECK
 * ============================================================
 */

router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    service: 'prontoequipas-api',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * ============================================================
 * AUTENTICAÇÃO
 * ============================================================
 *
 * /api/v1/auth
 * /api/v1/oauth
 * /api/v1/sessions
 * /api/v1/authorization
 */

router.use('/auth', createAuthRoutes());

router.use('/oauth', createOAuthRoutes());

router.use('/sessions', createSessionRoutes());

router.use('/authorization', createAuthorizationCheckRoutes());

/**
 * ============================================================
 * UTILIZADORES (legado)
 * ============================================================
 *
 * /api/v1/users
 */

const userModule = UserModule({
  authGateway: new AuthGatewayImpl({
    getAccountByUserId: async () => null,
    activateAccount: async () => {},
    deactivateAccount: async () => {},
    deleteAccount: async () => {},
  }),
  storageGateway: new StorageGatewayImpl({
    upload: async () => ({ url: '', key: '' }),
    delete: async () => {},
  }),
  notificationGateway: new NotificationGatewayImpl({
    send: async () => {},
  }),
  eventBus: {
    publish: async () => {},
    subscribe: () => {},
  },
  tokenService,
});

router.use('/users/profile', userModule.routes.profile);

router.use('/users/roles', userModule.routes.role);

router.use('/users/permissions', userModule.routes.permission);

router.use('/users/recent', createUserRecentRoutes());

router.use('/users', userModule.routes.user);

/**
 * ============================================================
 * EMPRESAS — sem contexto de tenant
 * ============================================================
 *
 * /api/v1/companies
 *
 * Criar/listar as próprias empresas. Qualquer utilizador
 * autenticado pode criar uma empresa e torna-se o seu admin.
 */

router.use('/companies', authenticate, tenancy.companyRoutes);

/**
 * ============================================================
 * CONTEXTO DE EMPRESA — com tenant
 * ============================================================
 *
 * /api/v1/company
 *
 * Sequência obrigatória (Identidade → Contexto → Permissão):
 *
 *   1. authenticate   — valida JWT + sessão activa;
 *   2. tenantContext  — resolve e valida o vínculo à empresa
 *                       (header `X-Company-Id` ou `?companyId=`);
 *   3. requirePermission — RBAC contextual (papel DENTRO da empresa).
 */

router.use('/company', authenticate, authz.tenantContext, tenancy.companyScopedRoutes);

router.use('/company', authenticate, authz.tenantContext, tenancy.auditRoutes);

router.use('/company/employees', authenticate, authz.tenantContext, employees.routes);

router.use('/contracts', authenticate, authz.tenantContext, contracts.routes);

router.use('/organization', authenticate, authz.tenantContext, organization.routes);

router.use('/leave', authenticate, authz.tenantContext, leave.routes);

router.use('/attendance', authenticate, authz.tenantContext, attendance.routes);

router.use('/loans', authenticate, authz.tenantContext, loans.routes);

router.use('/salary-structure', authenticate, authz.tenantContext, salaryStructure.routes);
router.use('/payroll', authenticate, authz.tenantContext, payroll.routes);
router.use('/payments', authenticate, authz.tenantContext, payments.routes);
router.use('/payslips', authenticate, authz.tenantContext, payslips.routes);
router.use('/reports', authenticate, authz.tenantContext, reports.routes);

// Internal payroll resolver uses the integration token; platform management uses JWT + PLATFORM RBAC.
router.use('/legal-rules', legalRules.integrationRoutes);
router.use('/legal-rules', authenticate, legalRules.managementRoutes);

/**
 * ============================================================
 * ADMINISTRAÇÃO DE PLATAFORMA
 * ============================================================
 *
 * /api/v1/platform
 *
 * Acesso reservado às roles globais de plataforma. Ao contrário do
 * middleware legado, NÃO há bypass para ADMIN — é exigida a role
 * indicada nas claims do JWT.
 */

router.use(
  '/platform',
  authenticate,
  authz.requirePlatformRole('SUPER_ADMIN'),
  tenancy.platformCompanyRoutes,
);

export default router;

