jest.mock('../../infra/database', () => {
  const { Sequelize } = require('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});

import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { sequelize } from '../../infra/database';
import { AuthAccountModel } from '../auth/infrastructure/persistence/models/auth-account.model';
import { RefreshTokenModel } from '../auth/infrastructure/persistence/models/refresh-token.model';
import { SessionManagerService } from '../auth/infrastructure/service/session-manager.service';
import { createRequirePlatformRole } from '../authorization/presentation/middlewares/require-platform-role.middleware';
import { UserModel } from '../user/infrastructure/persistence/models/user.model';
import { createIdentityAdminRoutes, createLegacyAccountLifecycleRoutes } from './identity.module';

it('protects global identities and revokes all existing credentials on disable', async () => {
  await sequelize.sync({ force: true });
  try {
    const user = await UserModel.create({ name: 'Test user', email: 'test@example.invalid', type: 'PLAYER' });
    const account = await AuthAccountModel.create({ userId: user.id, provider: 'LOCAL', email: user.email,
      providerAccountId: null, passwordHash: null, status: 'ACTIVE', emailVerifiedAt: new Date(), lockedUntil: null, lastLoginAt: null });
    const manager = new SessionManagerService();
    const input = { authAccountId: account.id, userId: user.id, ipAddress: null, userAgent: null, deviceId: null,
      accessTokenExpiresAt: new Date(Date.now() + 30000), refreshTokenExpiresAt: new Date(Date.now() + 60000) };
    const session = await manager.createSession(input);
    await manager.registerRefreshToken({ sessionId: session.sessionId, createToken: async () =>
      ({ token: 'test-token', expiresAt: input.refreshTokenExpiresAt }) });
    const original = (await RefreshTokenModel.findOne({ where: { sessionId: session.sessionId } }))!;
    const rotation = {
      sessionId: session.sessionId, tokenId: original.id, token: 'test-token', preserveExpiry: true,
      createNextToken: async () => ({ token: 'rotated-token', expiresAt: new Date(Date.now() + 86400000) }),
    };
    const rotated = await manager.rotateRefreshToken(rotation);
    expect(rotated?.expiresAt.getTime()).toBe(input.refreshTokenExpiresAt.getTime());
    expect(await manager.rotateRefreshToken(rotation)).toBeNull();
    const successor = (await original.reload()).replacedByTokenId!;
    expect(await manager.isRefreshTokenCurrent({
      userId: user.id, sessionId: session.sessionId, tokenId: successor, token: 'rotated-token',
    })).toBe(true);
    const roles = { hasAnyRole: async (id: number) => id === 100 };
    const audit = { record: jest.fn(async () => {}) };
    const app = express();
    app.use(express.json(), (req, _res, next) => {
      req.user = { userId: Number(req.get('actor')), roles: [], permissions: [], accountId: 1, sessionId: 1 };
      next();
    });
    app.use('/users', createRequirePlatformRole(roles)('SUPER_ADMIN'), createLegacyAccountLifecycleRoutes(audit, roles, async () => {}));
    app.use(createRequirePlatformRole(roles)('SUPER_ADMIN'), createIdentityAdminRoutes(audit, roles));
    app.use((error: { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
      res.sendStatus(error.statusCode ?? 500);
    });
    const path = '/identities/' + user.id;
    await request(app).post(path + '/disable').set('actor', '101').send({ reason: 'Test action' }).expect(403);
    await request(app).post('/identities/100/disable').set('actor', '100').send({ reason: 'Test action' }).expect(403);
    const result = await request(app).post(path + '/disable').set('actor', '100').send({ reason: 'Test action' }).expect(200);
    expect(result.body.data.revoked).toBe(1);
    expect(await manager.getSession(session.sessionId)).toBeNull();
    expect((await RefreshTokenModel.findOne())?.revokedAt).toBeInstanceOf(Date);
    await expect(manager.createSession(input)).rejects.toThrow('Identity unavailable');
    await request(app).post(path + '/enable').set('actor', '100').send({ reason: 'Test restoration' }).expect(200);
    expect((await manager.getSession(session.sessionId))?.status).toBe('REVOKED');
    expect(audit.record).toHaveBeenCalledTimes(2);
    const nextSession = await manager.createSession(input);
    await manager.registerRefreshToken({ sessionId: nextSession.sessionId, createToken: async () =>
      ({ token: 'legacy-session', expiresAt: input.refreshTokenExpiresAt }) });
    const legacy = '/users/' + user.id;
    await request(app).patch(legacy + '/deactivate').set('actor', '101').expect(403);
    await request(app).patch(legacy + '/deactivate').set('actor', '100').expect(200);
    expect(await manager.getSession(nextSession.sessionId)).toBeNull();
    expect(await RefreshTokenModel.count({ where: { sessionId: nextSession.sessionId, revokedAt: null } })).toBe(0);
    await expect(manager.createSession(input)).rejects.toThrow('Identity unavailable');
    await request(app).patch(legacy + '/activate').set('actor', '100').expect(200);
    expect((await manager.getSession(nextSession.sessionId))?.status).toBe('REVOKED');
    await manager.createSession(input);
    await request(app).delete(legacy).set('actor', '100').expect(204);
    await expect(manager.createSession(input)).rejects.toThrow('Identity unavailable');
  } finally {
    await sequelize.close();
  }
});
