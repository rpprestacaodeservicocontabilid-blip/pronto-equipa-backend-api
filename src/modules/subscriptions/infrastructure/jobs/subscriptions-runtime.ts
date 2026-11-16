import { Op, QueryTypes } from 'sequelize';
import { Queue, Worker } from 'bullmq';
import { RedisManager } from '../../../../infra/redis';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import { sequelize } from '../../../../infra/database';
import { logger } from '../../../../config/logger';
import { SubscriptionsApplicationService } from '../../application/use-cases/subscriptions-application.service';
import { SubscriptionOutboxModel } from '../persistence/models/subscriptions.models';
export class SubscriptionsRuntime {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private dispatching = false;
  private queue?: Queue;
  private worker?: Worker;
  constructor(private readonly service: SubscriptionsApplicationService) {}
  start() {
    if (process.env.SUBSCRIPTIONS_WORKER_ENABLED === 'true') {
      if (!RedisManager.isEnabled()) throw new Error('Subscriptions workers require Redis.');
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
      this.queue = new Queue('subscriptions-lifecycle', { connection });
      this.worker = new Worker(
        'subscriptions-lifecycle',
        async (job) => {
          const companyId = Number(job.data.companyId);
          if (!Number.isSafeInteger(companyId) || companyId <= 0)
            throw new Error('Invalid subscription lifecycle tenant.');
          await this.service.runLifecycle(companyId);
          await this.service.applyScheduledChanges(companyId);
        },
        { connection, concurrency: 8, limiter: { max: 30, duration: 1000 } },
      );
      this.worker.on('error', (e) =>
        logger.error('[subscriptions] worker error', { message: e.message }),
      );
    }
    this.timer = setInterval(
      () => {
        void this.tick().catch((e) =>
          logger.error('[subscriptions] lifecycle job failed', { message: String(e) }),
        );
      },
      Number(process.env.SUBSCRIPTIONS_SWEEP_INTERVAL_MS || 300000),
    );
    this.timer.unref();
    void this.tick().catch((e) =>
      logger.error('[subscriptions] initial lifecycle job failed', { message: String(e) }),
    );
  }
  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const companies = await CompanyModel.findAll({
        where: { status: 'ACTIVE' },
        attributes: ['id'],
        order: [['id', 'ASC']],
      });
      for (const c of companies) {
        const id = Number(c.id);
        if (this.queue) {
          const jobId = `lifecycle-${id}-${Math.floor(Date.now() / Number(process.env.SUBSCRIPTIONS_SWEEP_INTERVAL_MS || 300000))}`;
          await this.queue.add(
            'process-tenant',
            { companyId: id },
            {
              jobId,
              attempts: 5,
              backoff: { type: 'exponential', delay: 5000 },
              removeOnComplete: true,
              removeOnFail: 1000,
            },
          );
        } else {
          await this.service.runLifecycle(id);
          await this.service.applyScheduledChanges(id);
        }
      }
      await this.dispatchOutbox(companies.map((c) => Number(c.id)));
    } finally {
      this.running = false;
    }
  }
  private async dispatchOutbox(companyIds: number[]) {
    const url = process.env.SUBSCRIPTIONS_EVENTS_URL;
    if (!url || this.dispatching) return;
    this.dispatching = true;
    try {
      for (const companyId of companyIds) {
        await sequelize.transaction(async (tx) => {
          if (sequelize.getDialect() === 'postgres')
            await sequelize.query("SELECT set_config('app.current_tenant', :tenant, true)", {
              replacements: { tenant: String(companyId) },
              type: QueryTypes.SELECT,
              transaction: tx,
            });
          const events = await SubscriptionOutboxModel.findAll({
            where: { [Op.or]: [{ companyId: null }, { companyId }], status: 'PENDING' },
            order: [['createdAt', 'ASC']],
            limit: 20,
            transaction: tx,
            lock: tx.LOCK.UPDATE,
            skipLocked: true,
          });
          for (const event of events) {
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(process.env.SUBSCRIPTIONS_EVENTS_TOKEN
                  ? { Authorization: `Bearer ${process.env.SUBSCRIPTIONS_EVENTS_TOKEN}` }
                  : {}),
                'Idempotency-Key': String(event.id),
              },
              body: JSON.stringify({ id: event.id, tenantId: event.companyId, ...event.data }),
              signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) throw new Error(`Event destination returned ${response.status}.`);
            await event.update(
              {
                status: 'PUBLISHED',
                data: { ...event.data, publishedAt: new Date().toISOString() },
              },
              { transaction: tx },
            );
          }
        });
      }
    } finally {
      this.dispatching = false;
    }
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
  }
}
