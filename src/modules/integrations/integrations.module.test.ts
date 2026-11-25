import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { createRequirePlatformRole } from '../authorization/presentation/middlewares/require-platform-role.middleware';
import { createIntegrationsModule } from './integrations.module';

it('isolates denied and unavailable sources and returns only approved fields', async () => {
  const payments = jest.fn(() => ({ items: [], total: 0 }));
  const app = express();
  app.use((req, _res, next) => {
    const actor = Number(req.get('actor'));
    if (actor) req.user = { userId: actor, roles: [], permissions: [], accountId: 1, sessionId: 1 };
    next();
  });
  app.use(createRequirePlatformRole({ hasAnyRole: async id => id === 1 })('SUPER_ADMIN'));
  app.use(createIntegrationsModule({
    PAYMENTS: { authorize: async () => false, read: payments },
    NOTIFICATIONS: {
      read: () => ({ total: 1, items: [{
        id: 'EMAIL', name: 'Email', type: 'EMAIL', state: 'CONFIGURED' as const, token: 'fixture-not-for-display',
      }] }),
    },
    AI: { read: async () => { throw new Error('Internal fixture error'); } },
  }));
  app.use((error: { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.sendStatus(error.statusCode ?? 500);
  });

  await request(app).get('/catalog').set('actor', '2').expect(403);
  const result = await request(app).get('/catalog').set('actor', '1').expect('Cache-Control', 'no-store').expect(200);
  expect(payments).not.toHaveBeenCalled();
  expect(result.body.data.sources).toEqual([
    { source: 'PAYMENTS', status: 'RESTRICTED' },
    { source: 'NOTIFICATIONS', status: 'AVAILABLE', total: 1, readDurationMs: expect.any(Number),
      providers: [{ id: 'EMAIL', name: 'Email', type: 'EMAIL', state: 'CONFIGURED' }] },
    { source: 'AI', status: 'UNAVAILABLE' },
  ]);
});
