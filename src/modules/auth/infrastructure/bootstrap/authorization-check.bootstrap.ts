import { Router } from 'express';
import { z } from 'zod';
import type { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import type { PlatformRoleCheckerPort } from '../../../authorization/application/ports/platform-role-checker.port';
import { PermissionCode } from '../../../authorization/domain/value-objects/permission-code.vo';

const positiveId = z.coerce.number().int().positive().max(2147483647);

export function createAuthorizationCheckRoutes(
  service: Pick<AuthorizationService, 'authorize'>,
  roles: PlatformRoleCheckerPort,
): Router {
  const router = Router();
  router.get('/users/:userId/permissions/:permission', async (req, res, next) => {
    try {
      const actor = req.user?.userId;
      if (!actor) return res.sendStatus(401);
      const userId = positiveId.parse(req.params.userId);
      if (actor !== userId && !(await roles.hasAnyRole(actor, ['SUPER_ADMIN']))) return res.sendStatus(403);
      const { companyId } = z.object({ companyId: positiveId.optional() }).strict().parse(req.query);
      let permission: string;
      try {
        permission = PermissionCode.create(req.params.permission).value;
      } catch {
        return res.status(400).json({ message: 'A contextual permission code is required.' });
      }
      const allowed = await service.authorize({
        principalId: userId,
        permission,
        context: companyId === undefined ? { type: 'platform' } : { type: 'tenant', tenantId: companyId },
      });
      res.set('Cache-Control', 'private, no-store').json({ allowed });
    } catch (error) {
      next(error);
    }
  });
  return router;
}