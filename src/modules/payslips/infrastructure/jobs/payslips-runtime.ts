import { Queue, Worker } from 'bullmq';
import { RedisManager } from '../../../../infra/redis';
import { logger } from '../../../../config/logger';
import { SequelizeMembershipReader } from '../../../tenancy/infrastructure/persistence/readers/sequelize-membership.reader';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../../infra/database';
import { PayslipOutboxModel } from '../persistence/models/payslips.models';
import { PayslipsApplicationService } from '../../application/use-cases/payslips-application.service';

export class PayslipsRuntime {
  private queue?: Queue;
  private worker?: Worker;

  operationalHandles() {
    return { queue: this.queue, worker: this.worker };
  }
  private timer?: ReturnType<typeof setInterval>;
  private dispatching = false;
  constructor(private readonly service: PayslipsApplicationService) {}
  start() {
    if (process.env.PAYSLIPS_WORKER_ENABLED === 'true') {
      if (!RedisManager.isEnabled())
        throw new Error('Payslip workers require an available Redis connection.');
      const redis = RedisManager.client.options;
      const connection = {
        host: redis.host,
        port: redis.port,
        username: redis.username,
        password: redis.password,
        db: redis.db,
        tls: redis.tls,
        maxRetriesPerRequest: null,
      };
      this.queue = new Queue('payslip-batch-generation', { connection });
      this.service.setBatchEnqueuer(async (companyId, actorUserId, batchId) => {
        const batch = await this.service.getBatch(companyId, batchId);
        for (const item of batch.items.filter((row: any) => row.status !== 'GENERATED')) {
          const jobId = `payslip-${companyId}-${item.id}`,
            existing = await this.queue!.getJob(jobId);
          if (existing) {
            if ((await existing.getState()) === 'failed') await existing.retry();
            continue;
          }
          await this.queue!.add(
            'generate-item',
            { companyId, actorUserId, batchId, itemId: item.id },
            {
              jobId,
              attempts: 5,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: true,
              removeOnFail: 1000,
            },
          );
        }
      });
      const reader = new SequelizeMembershipReader();
      this.worker = new Worker(
        'payslip-batch-generation',
        async (job) => {
          const companyId = Number(job.data.companyId),
            actor = Number(job.data.actorUserId),
            batchId = String(job.data.batchId),
            itemId = String(job.data.itemId);
          if (
            !Number.isSafeInteger(companyId) ||
            companyId <= 0 ||
            !Number.isSafeInteger(actor) ||
            actor <= 0
          )
            throw new Error('Invalid payslip worker context.');
          const membership = await reader.findMembership(companyId, actor),
            permissions = await reader.findPermissionNames(companyId, actor);
          if (
            !membership ||
            membership.memberStatus !== 'ACTIVE' ||
            membership.companyStatus !== 'ACTIVE' ||
            !permissions.includes('payslips:generate-batch')
          )
            throw new Error('Payslip generation authorization revoked.');
          await this.service.generateBatchItem(companyId, actor, batchId, itemId);
        },
        { connection, concurrency: 8, limiter: { max: 40, duration: 1000 } },
      );
      this.worker.on('error', (error) =>
        logger.error('[payslips] worker error', { message: error.message }),
      );
    }
    if (process.env.PAYSLIPS_EVENTS_URL) {
      this.timer = setInterval(() => {
        void this.dispatchOutbox().catch((error) =>
          logger.error('[payslips] outbox dispatch failed', { message: String(error) }),
        );
      }, 10000);
      this.timer.unref();
      void this.dispatchOutbox().catch((error) =>
        logger.error('[payslips] initial outbox dispatch failed', { message: String(error) }),
      );
    }
  }
  private async dispatchOutbox() {
    if (this.dispatching || !process.env.PAYSLIPS_EVENTS_URL) return;
    this.dispatching = true;
    try {
      const companies = await CompanyModel.findAll({
        where: { status: 'ACTIVE' },
        attributes: ['id'],
        order: [['id', 'ASC']],
      });
      for (const company of companies) {
        await sequelize.transaction(async (transaction) => {
          if (sequelize.getDialect() === 'postgres')
            await sequelize.query("SELECT set_config('app.current_tenant', :tenant, true)", {
              replacements: { tenant: String(company.id) },
              type: QueryTypes.SELECT,
              transaction,
            });
          const events = await PayslipOutboxModel.findAll({
            where: { companyId: company.id, status: 'PENDING' },
            order: [['createdAt', 'ASC']],
            limit: 20,
            transaction,
            lock: transaction.LOCK.UPDATE,
            skipLocked: true,
          });
          for (const event of events) {
            const response = await fetch(process.env.PAYSLIPS_EVENTS_URL!, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(process.env.PAYSLIPS_EVENTS_TOKEN
                  ? { Authorization: `Bearer ${process.env.PAYSLIPS_EVENTS_TOKEN}` }
                  : {}),
                'Idempotency-Key': String(event.get('id')),
              },
              body: JSON.stringify({
                id: event.get('id'),
                companyId: company.id,
                ...event.get('data'),
              }),
              signal: AbortSignal.timeout(10000),
            });
            if (!response.ok)
              throw new Error(`Payslip event delivery returned ${response.status}.`);
            await event.update(
              {
                status: 'PUBLISHED',
                data: {
                  ...event.get('data'),
                  publishedAt: new Date().toISOString(),
                },
              },
              { transaction },
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
    this.timer = undefined;
    await this.worker?.close();
    await this.queue?.close();
  }
}
