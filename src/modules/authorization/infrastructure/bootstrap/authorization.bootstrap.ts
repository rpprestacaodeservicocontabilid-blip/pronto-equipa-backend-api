import { Request, Response, NextFunction } from 'express';

import { MembershipReaderPort } from '../../../tenancy/application/ports/membership-reader.port';
import { TenantPermissionCheckerPort } from '../../application/ports/tenant-permission-checker.port';
import { AuthorizationService } from '../../application/services/authorization.service';
import { AuthorizationPolicyService } from '../../domain/services/authorization-policy.service';
import { SequelizePlatformRoleChecker } from '../persistence/sequelize-platform-role-checker';
import { SequelizeTenantPermissionChecker } from '../persistence/sequelize-tenant-permission-checker';
import { createTenantContextMiddleware } from '../http/middleware/tenant-context.middleware';
import { createRequireCompanyPermission } from '../http/middleware/require-company-permission.middleware';
import { createRequirePlatformRole } from '../http/middleware/require-platform-role.middleware';

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

interface CreateAuthorizationOptions {
  membershipReader: MembershipReaderPort;
}

export interface AuthorizationMiddlewares {
  /** Resolve `req.tenant` a partir do header/query + membership. */
  tenantContext: Middleware;
  /** `requireCompanyPermission("company.read")` — RBAC contextual. */
  requirePermission: (permission: string) => Middleware;
  /** `requirePlatformRole("SUPER_ADMIN")` — sem bypass de ADMIN. */
  requirePlatformRole: (...roles: string[]) => Middleware;
  checker: TenantPermissionCheckerPort;
  authorizationService: AuthorizationService;
}

/**
 * Composition root do módulo authorization.
 *
 * Cria os middlewares de contexto de tenant e de verificação
 * contextual de permissões usados pelo `main/routes.ts`.
 */
export const createAuthorization = (
  options: CreateAuthorizationOptions,
): AuthorizationMiddlewares => {
  const checker = new SequelizeTenantPermissionChecker();
  const platformRoleChecker = new SequelizePlatformRoleChecker();
  const authorizationService = new AuthorizationService(
    options.membershipReader,
    checker,
    platformRoleChecker,
    new AuthorizationPolicyService(),
  );

  return {
    tenantContext: createTenantContextMiddleware(options.membershipReader),
    requirePermission: createRequireCompanyPermission(checker),
    requirePlatformRole: createRequirePlatformRole(platformRoleChecker),
    checker,
    authorizationService,
  };
};
