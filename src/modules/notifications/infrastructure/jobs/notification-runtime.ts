import { z } from 'zod';
import { Queue, Worker } from 'bullmq';
import { RedisManager } from '../../../../infra/redis/index';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import { NotificationsService } from '../../application/use-cases/notifications.service';
import { logger } from '../../../../config/logger';
export class NotificationRuntime {
  private timer?: ReturnType<typeof setInterval>;
  private queue?: Queue;
  private worker?: Worker;
  private running = false;
  constructor(private service: NotificationsService) {}
  start() {
    if (process.env.NOTIFICATIONS_BULLMQ_ENABLED === 'true') {
      if (!RedisManager.isEnabled())
        throw new Error('Redis obrigatório para Notifications BullMQ.');
      const r = RedisManager.client.options,
        connection = {
          host: r.host,
          port: r.port,
          username: r.username,
          password: r.password,
          db: r.db,
          tls: r.tls,
          maxRetriesPerRequest: null,
        };
      this.queue = new Queue('notifications-delivery', { connection });
      this.worker = new Worker(
        'notifications-delivery',
        (job) =>
          this.service.process(
            z.object({ companyId: z.number().int().positive().nullable() }).parse(job.data)
              .companyId,
          ),
        { connection, concurrency: 5 },
      );
      this.worker.on('error', (e) =>
        logger.error('[notifications] worker error', { message: e.message }),
      );
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, 10000);
    this.timer.unref();
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const companies = await CompanyModel.findAll({ attributes: ['id'] });
      for (const id of [null, ...companies.map((c) => Number(c.id))]) {
        if (this.queue)
          await this.queue.add(
            'deliver',
            { companyId: id },
            {
              jobId: `scope-${id || 0}-${Math.floor(Date.now() / 10000)}`,
              attempts: 5,
              backoff: { type: 'exponential', delay: 5000 },
              removeOnComplete: true,
              removeOnFail: 1000,
            },
          );
        else await this.service.process(id);
        if (process.env.NOTIFICATIONS_CLEANUP_ENABLED === 'true') await this.service.cleanup(id);
      }
    } catch (error) {
      logger.error('[notifications] sweep error', { message: String(error) });
    } finally {
      this.running = false;
    }
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
  }
}
