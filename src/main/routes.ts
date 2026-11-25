import JobsManager from '../jobs';
import { createPlatformOperationsModule } from '../modules/platform-operations/platform-operations.module';
import { createIntegrationsModule } from '../modules/integrations/integrations.module';
import { listAiPlatform } from '../modules/ai-assistant/infrastructure/platform-ai-reads';
import { notificationChannelInventory } from '../modules/notifications/application/notification-channel-inventory';
import { createAuthorizationAdminRoutes } from '../modules/authorization/presentation/routes/authorization-admin.routes';
import { createAuditModule, auditRequestMiddleware } from '../modules/audit/audit.module';
import { auditRequestContext } from '../shared/infrastructure/context/audit-request-context';
import { logger } from '../config/logger';
import { SessionManagerService } from '../modules/auth/infrastructure/service/session-manager.service';
import { createNotificationsModule } from '../modules/notifications/notifications.module';
import { createSupportModule } from '../modules/support/support.module';
import { createPlatformNotificationsRoutes } from '../modules/notifications/presentation/routes/platform-notifications.routes';
import { createPlatformSupportRoutes } from '../modules/support/presentation/routes/platform-support.routes';
import { CompanyModel } from '../modules/tenancy/infrastructure/persistence/models/company.model';
import { createIdentityAdminRoutes, createLegacyAccountLifecycleRoutes } from '../modules/identity/identity.module';
import { SequelizePlatformRoleChecker } from '../modules/authorization/infrastructure/persistence/sequelize-platform-role-checker';
import { CompanyMemberModel } from '../modules/tenancy/infrastructure/persistence/models/company-member.model';
import { createOnboardingModule } from '../modules/onboarding/onboarding.module';
import { OnboardingTenantProvisioning } from '../modules/tenancy/infrastructure/adapters/onboarding-provisioning';
import { UserModel } from '../modules/user/infrastructure/persistence/models/user.model';
import { createPlatformBillingModule } from '../modules/platform-billing/platform-billing.module';
import { Router } from 'express';

// ============================================================
// AUTH (identidade) — legado existente
// ============================================================

import {
  createAuthRoutes,
  createOAuthRoutes,
  createSessionRoutes,
} from '../modules/auth/auth.module';
import { createAuthorizationCheckRoutes } from '../modules/auth/auth.module';
import { authenticationMiddleware } from '../modules/auth/presentation/middlewares/authentication.middleware';
import { JwtTokenService } from '../modules/auth/infrastructure/service/jwt-token.service';

// ============================================================
// USER (identidade) — legado existente
// ============================================================

import { UserModule, createRecentUsersModule } from '../modules/user/user.module';

import { AuthGatewayImpl } from '../modules/user/infrastructure/integrations/auth/auth.gateway.impl';
import { StorageGatewayImpl } from '../modules/user/infrastructure/integrations/storage/storage.gateway.impl';
import { NotificationGatewayImpl } from '../modules/user/infrastructure/integrations/notifications/notification.gateway.impl';

// ============================================================
// FASE 1 — TENANCY / AUTHORIZATION / AUDIT
// ============================================================

import { createTenancyModule } from '../modules/tenancy/tenancy.module';
import { createAuthorization } from '../modules/authorization/authorization.module';
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
import { createPlatformPaymentsRoutes } from '../modules/payments/presentation/routes/platform-payments.routes';
import { createPayslipsModule } from '../modules/payslips/payslips.module';
import { createPlatformPayslipsRoutes } from '../modules/payslips/presentation/routes/platform-payslips.routes';
import { createLegalRulesModule } from '../modules/legal-rules/legal-rules.module';
import { createSimulationsModule } from '../modules/simulations/simulations.module';
import { createReportsModule } from '../modules/reports/reports.module';
import { createPlatformReportsModule } from '../modules/reports/platform-reports.module';
import { createPlatformAiRoutes } from '../modules/ai-assistant/presentation/routes/platform-ai.routes';
import { createDocumentsModule } from '../modules/documents/documents.module';
import { createSubscriptionsModule } from '../modules/subscriptions/subscriptions.module';

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
const authenticate = authenticationMiddleware(tokenService, new SessionManagerService());

// ============================================================
// FASE 1 — MÓDULOS DE FUNDACÇÃO
// ============================================================

const membershipReader = new SequelizeMembershipReader();

const authz = createAuthorization({ membershipReader });

const tenancy = createTenancyModule({
  requirePermission: authz.requirePermission,
});
export const audit = createAuditModule({
  authorize: (actorId, companyId, permission) =>
    authz.authorizationService.authorize({
      principalId: actorId,
      context: companyId === null ? { type: 'platform' } : { type: 'tenant', tenantId: companyId },
      permission:
        companyId === null && permission !== 'audit:records:read-platform'
          ? 'platform:' + permission
          : permission,
    }),
});
router.use(
  auditRequestMiddleware(audit.services.core, auditRequestContext, () =>
    logger.error('[audit] HTTP audit recording failed'),
  ),
);
router.use('/admin/audit', authenticate, audit.platformRoutes);
router.use('/audit/personal', authenticate, audit.personalRoutes);
router.use('/audit', authenticate, authz.tenantContext, audit.routes);
const employees = createEmployeesModule({
  transactionalAudit: audit.transactionalActivityAudit,
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
const payroll = createPayrollModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
});
export const payments = createPaymentsModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
});
export const payslips = createPayslipsModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
});
const legalRules = createLegalRulesModule({
  authorization: authz.authorizationService,
  audit: tenancy.auditRecorder,
});
export const simulations = createSimulationsModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
});
export const platformReports = createPlatformReportsModule(tenancy.auditRecorder, async (from, to) =>
  (await onboarding.service.overview(from, to)).daily,
);
const reports = createReportsModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
});
export const documents = createDocumentsModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
});
export const subscriptions = createSubscriptionsModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
});

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

router.use(
  '/authorization/admin',
  authenticate,
  authz.requirePlatformRole('SUPER_ADMIN'),
  createAuthorizationAdminRoutes(authz.authorizationService),
);
router.use('/authorization', authenticate, createAuthorizationCheckRoutes(authz.authorizationService, new SequelizePlatformRoleChecker()));

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

// Own-profile reads retain the existing controller and authenticated session.
// Every other legacy user operation addresses platform-wide account data.
router.use('/users', authenticate, (req, res, next) => {
  if (req.method === 'GET' && req.path === '/profile/me') return next();
  return authz.requirePlatformRole('SUPER_ADMIN')(req, res, next);
});
router.use('/users/profile', userModule.routes.profile);

router.use('/users/roles', userModule.routes.role);

router.use('/users/permissions', userModule.routes.permission);

router.use('/users/recent', createRecentUsersModule());

router.use('/users', createLegacyAccountLifecycleRoutes(tenancy.auditRecorder, new SequelizePlatformRoleChecker(), userModule.invalidateUser));
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
router.use(
  '/platform/payments',
  authenticate,
  createPlatformPaymentsRoutes(
    payments.service,
    (principalId, permission) =>
      authz.authorizationService.authorize({ principalId, context: { type: 'platform' }, permission }),
    tenancy.auditRecorder,
  ),
);
router.use(
  '/platform/payslips',
  authenticate,
  authz.requirePlatformRole('SUPER_ADMIN'),
  createPlatformPayslipsRoutes(tenancy.auditRecorder),
);
router.use('/payslips', authenticate, authz.tenantContext, payslips.routes);
router.use('/platform/reports', authenticate, authz.requirePlatformRole('SUPER_ADMIN'), platformReports.routes);
router.use('/identity/admin', authenticate, authz.requirePlatformRole('SUPER_ADMIN'),
  createIdentityAdminRoutes(tenancy.auditRecorder, new SequelizePlatformRoleChecker()));
router.use('/ai-assistant/admin', authenticate, authz.requirePlatformRole('SUPER_ADMIN'), createPlatformAiRoutes(tenancy.auditRecorder));
router.use('/reports', authenticate, authz.tenantContext, reports.routes);
router.use('/simulations', authenticate, authz.tenantContext, simulations.routes);
router.get('/platform/simulations/:companyId/overview', authenticate, authz.requirePlatformRole('SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const companyId = Number(req.params.companyId);
      if (!Number.isInteger(companyId) || companyId < 1 || companyId > 2147483647) { res.sendStatus(400); return; }
      const company = await CompanyModel.findByPk(companyId, { attributes: ['id', 'name'] });
      if (!company) { res.sendStatus(404); return; }
      res.set('Cache-Control', 'private, no-store').json({
        success: true, data: { company: { id: company.id, name: company.name }, ...await simulations.service.oversight(companyId) },
      });
    } catch (error) { next(error); }
  });
router.get('/platform/documents/:companyId/overview', authenticate, authz.requirePlatformRole('SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const companyId = Number(req.params.companyId);
      if (!Number.isInteger(companyId) || companyId < 1 || companyId > 2147483647) { res.sendStatus(400); return; }
      const company = await CompanyModel.findByPk(companyId, { attributes: ['id', 'name'] });
      if (!company) { res.sendStatus(404); return; }
      res.set('Cache-Control', 'no-store').json({
        success: true, data: { company: { id: company.id, name: company.name }, ...await documents.service.oversight(companyId) },
      });
    } catch (error) { next(error); }
  });
router.use('/documents', authenticate, authz.tenantContext, documents.routes);
router.use(
  '/subscriptions/admin',
  authenticate,
  authz.requirePlatformRole('SUPER_ADMIN'),
  subscriptions.adminRoutes,
);
router.use('/subscriptions/internal', subscriptions.integrationRoutes);
router.use('/subscriptions', authenticate, authz.tenantContext, subscriptions.routes);

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

const billingRoleChecker = new SequelizePlatformRoleChecker();
export const platformBilling = createPlatformBillingModule({
  requirePermission: authz.requirePermission,
  isPlatformAdmin: actor => billingRoleChecker.hasAnyRole(actor, ['SUPER_ADMIN']),
  authorizePlatform: (principalId, permission) => authz.authorizationService.authorize({
    principalId, context: { type: 'platform' }, permission,
  }),
  readSubscription: (companyId) => subscriptions.service.billingContract(companyId),
  applySubscriptionEvent: (event) => subscriptions.service.applyBillingEvent(event),
});
router.use('/platform-billing/internal', platformBilling.integrationRoutes);
router.use(
  '/platform-billing/admin',
  authenticate,
  platformBilling.adminRoutes,
);
router.use('/platform-billing', authenticate, authz.tenantContext, platformBilling.routes);
export const notifications = createNotificationsModule({
  guard: authz.requirePermission,
  directory: {
    async resolve(userId, companyId) {
      if (
        companyId !== null &&
        !(await CompanyMemberModel.findOne({ where: { companyId, userId, status: 'ACTIVE' } }))
      )
        throw Object.assign(new Error('Destinatário não autorizado.'), { statusCode: 403 });
      const user = await UserModel.findByPk(userId);
      if (!user || user.status !== 'ACTIVE')
        throw Object.assign(new Error('Destinatário indisponível.'), { statusCode: 422 });
      return { email: user.emailVerifiedAt ? user.email : null, phone: null };
    },
  },
});
audit.runtime.setNotifications({
  async alert(scope, id, severity) {
    const raw: unknown = JSON.parse(process.env.AUDIT_ALERT_RECIPIENTS_JSON || '{}');
    const mapping =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const configured = mapping[scope.scopeKey];
    if (!Array.isArray(configured) || !configured.length)
      throw new Error('Configure audit alert recipients.');
    const recipients: number[] = [];
    for (const candidate of configured) {
      const userId = Number(candidate);
      if (!Number.isSafeInteger(userId) || userId <= 0)
        throw new Error('Invalid audit alert recipient.');
      const permitted = await authz.authorizationService.authorize({
        principalId: userId,
        context:
          scope.companyId === null
            ? { type: 'platform' }
            : { type: 'tenant', tenantId: scope.companyId },
        permission: scope.companyId === null ? 'platform:audit:alerts:read' : 'audit:alerts:read',
      });
      if (permitted) recipients.push(userId);
    }
    if (!recipients.length) throw new Error('No authorized audit alert recipients.');
    await notifications.service.send(null, 0, {
      key: 'audit-alert:' + id,
      category: 'SECURITY',
      template: 'AUDIT_ALERT',
      variables: { alertId: id, severity, scope: scope.scopeKey },
      recipients,
      channels: ['IN_APP'],
    });
  },
});
router.use('/platform/notifications', authenticate, createPlatformNotificationsRoutes(notifications.service, {
  audit: tenancy.auditRecorder,
  authorize: (principalId, permission) => authz.authorizationService.authorize({ principalId, context: { type: 'platform' }, permission }),
}));
router.use('/notifications/internal', notifications.integrationRoutes);
router.use('/notifications/personal', authenticate, notifications.personalRoutes);
router.use(
  '/notifications/admin',
  authenticate,
  authz.requirePlatformRole('SUPER_ADMIN'),
  notifications.adminRoutes,
);
router.use('/notifications', authenticate, authz.tenantContext, notifications.routes);

router.use('/platform-operations', authenticate, authz.requirePlatformRole('SUPER_ADMIN'),
  createPlatformOperationsModule(() => JobsManager.operationalSchedules()));

router.use('/integrations/admin', authenticate, authz.requirePlatformRole('SUPER_ADMIN'), createIntegrationsModule({
  PAYMENTS: {
    authorize: principalId => authz.authorizationService.authorize({
      principalId, context: { type: 'platform' }, permission: 'payments.platform.integrations.read',
    }),
    read: () => {
      const items = payments.service.listProviders().map(provider => ({
        id: provider.id, name: provider.name, type: provider.type, state: 'REGISTERED' as const,
        capabilities: provider.capabilities,
      }));
      return { items, total: items.length };
    },
  },
  NOTIFICATIONS: {
    read: () => {
      const items = notificationChannelInventory().map(({ channel, configured }) => ({
        id: channel, name: channel === 'EMAIL' ? 'Email' : 'SMS', type: channel,
        state: configured ? 'CONFIGURED' as const : 'NOT_CONFIGURED' as const,
      }));
      return { items, total: items.length };
    },
  },
  AI: {
    async read() {
      const result = await listAiPlatform('providers', { page: 1, limit: 100 });
      return {
        total: result.total,
        items: result.items.map(item => {
          const { id, name, status } = item as { id: string; name: string; status: string };
          return { id, name, type: 'AI', state: status === 'ACTIVE' || status === 'DISABLED' ? status : 'UNKNOWN' };
        }),
      };
    },
  },
}));
export const support = createSupportModule({
  requirePermission: authz.requirePermission,
  audit: tenancy.auditRecorder,
  notifications: notifications.service,
  subscriptions: subscriptions.service,
  documents: documents.service,
});
router.use('/platform/support', authenticate, createPlatformSupportRoutes(support.service, {
  audit: tenancy.auditRecorder,
  authorize: (principalId, permission) => authz.authorizationService.authorize({ principalId, context: { type: 'platform' }, permission }),
}));
router.use('/support/admin', authenticate, authz.tenantContext, support.admin);
router.use('/support', authenticate, authz.tenantContext, support.routes);
const onboardingTenant = new OnboardingTenantProvisioning();
const onboardingRoleChecker = new SequelizePlatformRoleChecker();
export const onboarding = createOnboardingModule(
  {
    validateLegal: (id) => legalRules.isPublished(id),
    configurePayroll: async (companyId, actor, config) => {
      const calendars = await organization.service.list(companyId, 'WORK_CALENDAR', {
        page: 1,
        limit: 100,
      });
      if (!calendars.data.some((r) => r.code === 'ONB-CALENDAR'))
        await organization.service.create(companyId, actor, {
          type: 'WORK_CALENDAR',
          code: 'ONB-CALENDAR',
          name: 'Calendário inicial',
          effectiveFrom: config.effectiveFrom,
          data: { workingWeekdays: config.workingDays, legalRuleVersionId: config.legalRuleSetId },
        });
      for (const component of config.components || []) {
        const old = await salaryStructure.service.query((repo) =>
          repo.listComponents(companyId, { page: 1, limit: 1, code: component.code }),
        );
        if (!old.data.length)
          await salaryStructure.service.execute(
            companyId,
            actor,
            'onboarding.salary-component.created',
            'salary_component',
            (repo) => repo.createComponent(companyId, actor, component),
          );
      }
    },
    configureOrganization: async (companyId, actor, configuration) => {
      for (const [field, type] of [
        ['departments', 'DEPARTMENT'],
        ['costCenters', 'COST_CENTER'],
      ] as const) {
        const names = configuration[field] || [];
        const existing = await organization.service.list(companyId, type, { page: 1, limit: 200 });
        for (let i = 0; i < names.length; i++) {
          const code = `ONB-${field}-${i + 1}`;
          if (!existing.data.some((row) => row.code === code))
            await organization.service.create(companyId, actor, { type, code, name: names[i] });
        }
      }
    },
    verifiedUser: async (actor) => {
      const user = await UserModel.findByPk(actor);
      return Boolean(user?.emailVerifiedAt && user.status === 'ACTIVE');
    },
    provision: (input) => onboardingTenant.provision(input),
    activate: (companyId, applicationId) => onboardingTenant.activate(companyId, applicationId),
    plans: () => subscriptions.service.listPlans(true),
    subscribe: (companyId, actor, plan, key) =>
      subscriptions.service.createSubscription(companyId, actor, { ...plan, idempotencyKey: key }),
    subscription: (companyId) => subscriptions.service.current(companyId),
    billingAccount: (companyId, actor, company) =>
      platformBilling.service.account(companyId, actor, company),
  },
  {
    assigneeAvailable: (id) => onboardingRoleChecker.hasAnyRole(id, ['SUPER_ADMIN']),
    companyTaxRegistry: async () => {
      const rows = await CompanyModel.findAll({ attributes: ['id', 'name', 'nif'] });
      return rows.flatMap((row) => row.nif ? [{ id: row.id, name: row.name, taxId: row.nif }] : []);
    },
    inviteAddress: async (actor) => {
      const user = await UserModel.findByPk(actor);
      if (!user?.emailVerifiedAt) throw new Error('Verifique o e-mail antes de aceitar o convite.');
      return user.email;
    },
    importEmployee: async (companyId, actor, input, kind) => {
      if (kind === 'CONTRACTS') {
        const old = await contracts.service.list(companyId, {
          page: 1,
          limit: 100,
          employeeId: input.employeeId,
        });
        const match = old.data.find((r) => r.contractNumber === input.contractNumber);
        return match || contracts.service.create({ ...input, companyId, actorUserId: actor });
      }
      if (kind === 'SALARIES') {
        const old = await salaryStructure.service.query((repo) =>
          repo.listAssignments(companyId, { page: 1, limit: 100, employeeId: input.employeeId }),
        );
        const match = old.data.find(
          (r: any) =>
            r.contractId === input.contractId &&
            new Date(r.effectiveFrom).toISOString().slice(0, 10) === input.effectiveFrom,
        );
        return (
          match ||
          salaryStructure.service.execute(
            companyId,
            actor,
            'onboarding.salary.imported',
            'salary_assignment',
            (repo) => repo.createAssignment(companyId, actor, input),
          )
        );
      }
      return employees.importInitial(companyId, actor, input);
    },
    reserveEmployee: (companyId, key) =>
      subscriptions.usage.reserve({
        tenantId: String(companyId),
        metricCode: 'ACTIVE_EMPLOYEES',
        quantity: '1',
        operationKey: key,
      }),
    settleEmployee: (companyId, id, commit) =>
      commit
        ? subscriptions.usage.commit({ tenantId: String(companyId), reservationId: id })
        : subscriptions.usage.release({ tenantId: String(companyId), reservationId: id }),
    notify: async (ownerId, key, status) => {
      await notifications.service.send(null, 0, {
        key,
        category: 'ONBOARDING',
        template: 'ONBOARDING_STATUS',
        variables: { status },
        recipients: [ownerId],
        channels: ['IN_APP'],
      });
    },
  },
);
router.use(
  '/onboarding/admin',
  authenticate,
  authz.requirePlatformRole('SUPER_ADMIN'),
  onboarding.adminRoutes,
);
router.use('/onboarding', authenticate, onboarding.routes);
export default router;

