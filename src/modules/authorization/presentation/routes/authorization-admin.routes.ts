import { Router } from 'express';
import { z } from 'zod';
import { BadRequestError } from '../../../../shared/errors/app.error';
import { AuthorizationService } from '../../application/services/authorization.service';
import { PermissionCode } from '../../domain/value-objects/permission-code.vo';
import { SequelizeAuthorizationAdminStore } from '../../infrastructure/persistence/sequelize-authorization-admin.store';

const identifier = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const params = z.object({ id: identifier });
const companyId = z.object({ companyId: identifier.optional() });
const page = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  search: z.string().trim().max(150).optional(),
});
const permissionsQuery = page.extend({ scope: z.enum(['PLATFORM', 'TENANT', 'GLOBAL']).optional() });
const rolesQuery = page.extend(companyId.shape);
const simulation = z.object({
  userId: z.number().int().positive(),
  permissionId: z.number().int().positive(),
  companyId: z.number().int().positive().optional(),
});

/** Mounted behind live platform role validation. */
export function createAuthorizationAdminRoutes(authorization: AuthorizationService) {
  const router = Router();
  const directory = new SequelizeAuthorizationAdminStore();

  router.get('/overview', async (_req, res) => {
    res.json({ data: await directory.overview() });
  });
  router.get('/permissions', async (req, res) => {
    res.json({ data: await directory.listPermissions(permissionsQuery.parse(req.query)) });
  });
  router.get('/roles', async (req, res) => {
    const query = rolesQuery.parse(req.query);
    res.json({ data: await directory.listRoles(query, query.companyId ?? null) });
  });
  router.get('/users/:id/access', async (req, res) => {
    const { id } = params.parse(req.params);
    const query = companyId.parse(req.query);
    res.json({ data: await directory.assignedRoles(id, query.companyId ?? null) });
  });
  router.post('/simulate', async (req, res) => {
    const { userId, permissionId, companyId } = simulation.parse(req.body);
    const [user, permission] = await Promise.all([
      directory.user(userId), directory.permission(permissionId),
      companyId === undefined ? undefined : directory.company(companyId),
    ]);
    const scope = companyId === undefined ? 'PLATFORM' : 'TENANT';
    if (permission.scope !== scope) {
      throw new BadRequestError('Choose a contextual permission matching the selected scope.');
    }
    try {
      PermissionCode.create(permission.name);
    } catch {
      throw new BadRequestError('This permission code is unsupported by the contextual authorization engine.');
    }
    const active = user.status === 'ACTIVE' && !user.identityDisabledAt;
    const allowed = active && await authorization.authorize({
      principalId: userId,
      context: companyId === undefined ? { type: 'platform' } : { type: 'tenant', tenantId: companyId },
      permission: permission.name,
    });
    res.json({ data: {
      allowed, scope, permission: permission.name,
      reason: active ? (allowed ? 'GRANTED' : 'DENIED_BY_POLICY') : 'ACCOUNT_INACTIVE',
    } });
  });

  return router;
}
