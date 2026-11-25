import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { Container } from '../../bootstrap/container';
import { HealthRegistry } from '../../bootstrap/health';
import { createRequirePlatformRole } from '../authorization/presentation/middlewares/require-platform-role.middleware';
import { createPlatformOperationsModule } from './platform-operations.module';
import { OPERATIONS_QUEUE_SOURCES, queueReader } from './queue-inventory';

it('reports existing readiness and keeps a failed queue separate from a queue that never started', async () => {
  const health = new HealthRegistry();
  health.set('database', 'down', true);
  const container = new Container();
  const context = { health, container, lifecycle: { isReady: true, state: 'ready' } };
  container.bind(context as Parameters<Container['bind']>[0]);
  container.register(OPERATIONS_QUEUE_SOURCES, () => [
    queueReader('notifications', () => ({})),
    queueReader('payroll', () => ({ queue: {
      name: 'payroll-employee', isPaused: async () => { throw new Error('private Redis message'); },
      getJobCounts: async () => ({ active: 1 }),
    } })),
    queueReader('documents', () => ({ queue: {
      name: 'documents-processing', isPaused: async () => true, getJobCounts: async () => ({ paused: 2 }),
    } })),
  ]);
  const app = express();
  app.locals.context = context;
  app.use((req, _res, next) => {
    const userId = Number(req.get('actor'));
    if (userId) req.user = { userId, roles: [], permissions: [], accountId: 1, sessionId: 1 };
    next();
  });
  app.use(createRequirePlatformRole({ hasAnyRole: async id => id === 1 })('SUPER_ADMIN'));
  app.use(createPlatformOperationsModule(() => []));
  app.use((error: { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.sendStatus(error.statusCode ?? 500);
  });

  await request(app).get('/queues').set('actor', '2').expect(403);
  const overview = await request(app).get('/overview').set('actor', '1').expect('Cache-Control', 'no-store').expect(200);
  expect(overview.body.data).toMatchObject({ ready: false, health: 'down' });
  const result = await request(app).get('/queues').set('actor', '1').expect(200);
  expect(result.body.data.queues).toMatchObject([
    { key: 'notifications', status: 'NOT_STARTED', counts: null },
    { key: 'payroll', status: 'UNAVAILABLE', counts: null },
    { key: 'documents', status: 'PAUSED', counts: { paused: 2, active: 0 } },
  ]);
  expect(result.text).not.toContain('private Redis message');
});

it('bounds queue reads and shares a Redis read that has not settled', async () => {
  let finish!: (counts: Record<string, number>) => void;
  const pending = new Promise<Record<string, number>>(resolve => { finish = resolve; });
  const getJobCounts = jest.fn(() => pending);
  const read = queueReader('payroll', () => ({
    queue: { name: 'payroll-employee', getJobCounts, isPaused: async () => false },
  }), 5);
  expect((await read()).status).toBe('UNAVAILABLE');
  expect((await read()).status).toBe('UNAVAILABLE');
  expect(getJobCounts).toHaveBeenCalledTimes(1);
  finish({ active: 2 });
  expect((await read()).counts?.active).toBe(2);
});
