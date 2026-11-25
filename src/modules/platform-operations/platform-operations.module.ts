import { Router } from 'express';
import type { ApplicationContext } from '../../bootstrap/types/application-context';
import { OPERATIONS_QUEUE_SOURCES, QueueReader } from './queue-inventory';

export interface ScheduleView {
  key: string;
  status: 'ACTIVE' | 'NOT_STARTED';
  timezone: string;
  nextRunAt: string | null;
}

export function createPlatformOperationsModule(scheduledJobs: () => ScheduleView[]) {
  const routes = Router();
  routes.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  routes.get('/overview', (req, res) => {
    const context: ApplicationContext = req.app.locals.context;
    const health = context.health.snapshot();
    const memory = process.memoryUsage();
    res.json({ data: {
      observedAt: new Date().toISOString(),
      lifecycle: context.lifecycle.state,
      ready: context.lifecycle.isReady && health.status !== 'down',
      health: health.checks.length ? health.status : null,
      checks: health.checks,
      process: { uptimeSeconds: Math.floor(process.uptime()), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal },
    } });
  });
  routes.get('/queues', async (req, res) => {
    const context: ApplicationContext = req.app.locals.context;
    const readers = context.container.has(OPERATIONS_QUEUE_SOURCES)
      ? context.container.resolve<QueueReader[]>(OPERATIONS_QUEUE_SOURCES) : [];
    const queues = await Promise.all(readers.map(read => read()));
    res.json({ data: { observedAt: new Date().toISOString(), queues } });
  });
  routes.get('/scheduled-jobs', (_req, res) => {
    res.json({ data: { observedAt: new Date().toISOString(), schedules: scheduledJobs() } });
  });
  return routes;
}
