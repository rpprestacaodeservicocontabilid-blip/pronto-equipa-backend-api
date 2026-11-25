import { Request, Response, RequestHandler, Router } from 'express';
import { Op, Transaction } from 'sequelize';
import { z } from 'zod';
import { sequelize } from '../../infra/database';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { PlatformRoleCheckerPort } from '../authorization/application/ports/platform-role-checker.port';
import { AuthAccountModel } from '../auth/infrastructure/persistence/models/auth-account.model';
import { RefreshTokenModel } from '../auth/infrastructure/persistence/models/refresh-token.model';
import { SessionModel } from '../auth/infrastructure/persistence/models/session.model';
import { UserModel } from '../user/infrastructure/persistence/models/user.model';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors/app.error';

const attributes = ['id', 'name', 'email', 'status', 'emailVerifiedAt', 'createdAt', 'identityDisabledAt'];
const identityId = z.coerce.number().int().min(1).max(2147483647);
const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  search: z.string().trim().max(150).default(''),
  disabled: z.enum(['true', 'false']).optional(),
}).strict();
const reason = z.object({ reason: z.string().trim().min(5).max(500) }).strict();
const data = (user: UserModel) => ({
  id: user.id, name: user.name, email: user.email, status: user.status,
  emailVerifiedAt: user.emailVerifiedAt, createdAt: user.createdAt, disabledAt: user.identityDisabledAt,
});
const endpoint = (run: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void run(req, res).catch(next); };

async function revokeCredentials(id: number, at: Date, transaction: Transaction) {
  const accounts = await AuthAccountModel.findAll({ where: { userId: id }, attributes: ['id'], transaction });
  const accountIds = { [Op.in]: accounts.map(account => account.id) };
  const [revoked] = await SessionModel.update({ status: 'REVOKED', revokedAt: at },
    { where: { authAccountId: accountIds, status: 'ACTIVE' }, transaction });
  await RefreshTokenModel.update({ revokedAt: at }, { where: { authAccountId: accountIds, revokedAt: null }, transaction });
  return revoked;
}

export function createLegacyAccountLifecycleRoutes(audit: AuditRecorderPort, roles: PlatformRoleCheckerPort, invalidateUser: (id: number) => Promise<void>) {
  const router = Router();
  const change = (active: boolean, remove = false) => endpoint(async (req, res) => {
    const id = identityId.parse(req.params.id);
    const actor = req.user!.userId;
    if (actor === id || await roles.hasAnyRole(id, ['SUPER_ADMIN']))
      throw new ForbiddenError('Use the dedicated security procedures for platform administrators.');
    const user = await sequelize.transaction(async transaction => {
      const row = await UserModel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw new NotFoundError('User');
      if (row.status === 'DELETED') throw new ConflictError('Account has been deleted.');
      if (active && row.identityDisabledAt) throw new ConflictError('Identity has been disabled administratively.');
      await row.update({ status: active ? 'ACTIVE' : 'INACTIVE' }, { transaction });
      if (!active) await revokeCredentials(id, new Date(), transaction);
      return row;
    });
    await invalidateUser(id);
    await audit.record({ companyId: null, actorUserId: actor, entityType: 'identity', entityId: String(id),
      action: active ? 'identity.legacy.activated' : 'identity.legacy.deactivated', after: { status: user.status } });
    if (remove) return res.sendStatus(204);
    const { identityDisabledAt, deletedAt, ...profile } = user.get({ plain: true });
    return res.json({ ...profile, roles: [] });
  });
  router.patch('/:id/deactivate', change(false));
  router.patch('/:id/activate', change(true));
  router.delete('/:id', change(false, true));
  return router;
}

export function createIdentityAdminRoutes(audit: AuditRecorderPort, roles: PlatformRoleCheckerPort) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

  router.get('/identities', endpoint(async (req, res) => {
    const { page, search, disabled } = listQuery.parse(req.query);
    const limit = 25;
    const term = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
    const match = sequelize.getDialect() === 'postgres' ? Op.iLike : Op.like;
    const { rows, count } = await UserModel.findAndCountAll({
      attributes,
      where: {
        ...(search ? { [Op.or]: [{ name: { [match]: term } }, { email: { [match]: term } }] } : {}),
        ...(disabled === 'true' ? { identityDisabledAt: { [Op.ne]: null } } : disabled === 'false' ? { identityDisabledAt: null } : {}),
      },
      order: [['id', 'DESC']], limit, offset: (page - 1) * limit,
    });
    res.json({ data: rows.map(data), page, limit, total: count });
  }));

  router.get('/identities/:id', endpoint(async (req, res) => {
    const id = identityId.parse(req.params.id);
    const user = await UserModel.findByPk(id, { attributes });
    if (!user) throw new NotFoundError('Identity');
    const accounts = await AuthAccountModel.findAll({ where: { userId: id }, attributes: ['id'] });
    const activeSessions = await SessionModel.count({ where: {
      authAccountId: { [Op.in]: accounts.map(account => account.id) }, status: 'ACTIVE', expiresAt: { [Op.gt]: new Date() },
    } });
    res.json({ data: { ...data(user), activeSessions,
      protectedAccount: id === req.user!.userId || await roles.hasAnyRole(id, ['SUPER_ADMIN']) } });
  }));

  router.patch('/identities/:id', endpoint(async (req, res) => {
    const id = identityId.parse(req.params.id);
    const input = z.object({ name: z.string().trim().min(2).max(150) }).strict().parse(req.body);
    const user = await UserModel.findByPk(id, { attributes });
    if (!user) throw new NotFoundError('Identity');
    if (user.name !== input.name) {
      await user.update(input);
      await audit.record({ companyId: null, actorUserId: req.user!.userId, action: 'identity.profile.updated',
        entityType: 'identity', entityId: String(id), after: { fields: ['name'] } });
    }
    res.json({ data: data(user) });
  }));

  for (const action of ['disable', 'enable', 'revoke-sessions'] as const) {
    router.post('/identities/:id/' + action, endpoint(async (req, res) => {
      const id = identityId.parse(req.params.id);
      const actor = req.user!.userId;
      const input = reason.parse(req.body);
      if (id === actor || await roles.hasAnyRole(id, ['SUPER_ADMIN']))
        throw new ForbiddenError('Use the dedicated security procedures for platform administrators.');
      const result = await sequelize.transaction(async transaction => {
        const user = await UserModel.findByPk(id, { attributes, transaction, lock: transaction.LOCK.UPDATE });
        if (!user) throw new NotFoundError('Identity');
        if (action === 'enable' && user.status !== 'ACTIVE')
          throw new ConflictError('Resolve the underlying account status before restoring access.');
        const at = new Date();
        if (action === 'disable' && !user.identityDisabledAt) await user.update({ identityDisabledAt: at }, { transaction });
        if (action === 'enable' && user.identityDisabledAt) await user.update({ identityDisabledAt: null }, { transaction });
        let revoked = 0;
        if (action !== 'enable') {
          revoked = await revokeCredentials(id, at, transaction);
        }
        return { ...data(user), revoked };
      });
      await audit.record({ companyId: null, actorUserId: actor, action: 'identity.admin.' + action,
        entityType: 'identity', entityId: String(id), after: { reason: input.reason, revoked: result.revoked } });
      res.json({ data: result });
    }));
  }
  return router;
}
