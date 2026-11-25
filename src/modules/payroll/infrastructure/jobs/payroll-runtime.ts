import { z } from 'zod';

import { SequelizePayrollPersistence } from '../persistence/repositories/sequelize-payroll-persistence';
import { resolveRecordTransaction } from '../../../../shared/infrastructure/persistence/sequelize-record-store';
import { payrollPdf, payrollXlsx } from '../payroll-export';
import { Queue, Worker } from 'bullmq';
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../../../infra/database';
import { RedisManager } from '../../../../infra/redis';
import { logger } from '../../../../config/logger';
import {
  settlePayrollLoanDeductions,
  reservePayrollLoanDeductions,
} from '../adapters/payroll-loans.adapter';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import { SequelizeMembershipReader } from '../../../tenancy/infrastructure/persistence/readers/sequelize-membership.reader';
import { PayrollWorkflowService } from '../../application/use-cases/payroll-workflow.service';
import {
  PayrollItem,
  PayrollExport,
  PayrollBatch,
} from '../persistence/models/payroll-workflow.models';
import { PayrollOutboxModel } from '../persistence/models/payroll.models';
import {
  HttpPayrollLegalRules,
  SequelizePayrollSourceReader,
} from '../adapters/payroll-integrations.adapter';
import { PayrollCalculatorAdapter } from '../../../payroll-engine/infrastructure/adapters/payroll-calculator.adapter';

const payrollTaskSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  itemId: z.string().uuid(),
});

export const defaultPayrollService = () =>
  new PayrollWorkflowService(
    new SequelizePayrollSourceReader(new HttpPayrollLegalRules()),
    new PayrollCalculatorAdapter(),
    new SequelizePayrollPersistence(),
    {
      reserve: (companyId, runId, snapshot, result, context, simulation) =>
        reservePayrollLoanDeductions(
          companyId,
          runId,
          snapshot,
          result,
          resolveRecordTransaction(context)!,
          simulation,
        ),
    },
    { pdf: payrollPdf, xlsx: payrollXlsx },
  );

export class PayrollRuntime {
  private timer?: ReturnType<typeof setInterval>;
  private queue?: Queue;
  private worker?: Worker;

  operationalHandles() {
    return { queue: this.queue, worker: this.worker };
  }
  private busy = false;
  private running?: Promise<void>;
  start(): void {
    if (process.env.PAYROLL_WORKER_ENABLED !== 'true' || this.timer) return;
    if (!RedisManager.isEnabled()) throw new Error('Payroll workers require Redis.');
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
    this.queue = new Queue('payroll-employee', { connection });
    const service = defaultPayrollService();
    this.worker = new Worker(
      'payroll-employee',
      async (job) => {
        const { companyId, itemId } = payrollTaskSchema.parse(job.data);
        if (!Number.isSafeInteger(companyId) || companyId <= 0)
          throw new Error('Invalid tenant job');
        // Actor and tenant come from persisted task data, never from queue claims.
        const item = await sequelize.transaction(async (transaction) => {
          if (sequelize.getDialect() === 'postgres')
            await sequelize.query("SELECT set_config('app.current_tenant', :id, true)", {
              replacements: { id: String(companyId) },
              type: QueryTypes.SELECT,
              transaction,
            });
          const model = job.name === 'validate' ? PayrollBatch : PayrollItem;
          return model.findOne({ where: { companyId, id: itemId }, transaction });
        });
        if (!item) return;
        const reader = new SequelizeMembershipReader();
        const actor = Number(item.data.actorUserId);
        const membership = await reader.findMembership(companyId, actor);
        const permissions = await reader.findPermissionNames(companyId, actor);
        if (
          !membership ||
          membership.memberStatus !== 'ACTIVE' ||
          membership.companyStatus !== 'ACTIVE' ||
          !permissions.includes(
            job.name === 'validate' ? 'payroll:runs:validate' : 'payroll:runs:process',
          )
        )
          throw new Error('Payroll job authorization revoked');
        if (job.name === 'validate') await service.processValidation(companyId, itemId);
        else await service.processItem(companyId, itemId);
      },
      { connection, concurrency: 8, limiter: { max: 40, duration: 1000 } },
    );
    this.worker.on('error', (error) =>
      logger.error('[payroll] worker error', { message: error.message }),
    );
    this.timer = setInterval(() => {
      this.running = this.tick().catch((error) => {
        logger.error('[payroll] dispatch failed', { message: String(error) });
      });
    }, 10000);
    this.timer.unref();
    this.running = this.tick().catch((error) => {
      logger.error('[payroll] initial dispatch failed', { message: String(error) });
    });
  }
  private async tick() {
    if (this.busy || !this.queue) return;
    this.busy = true;
    try {
      // The company registry is the non-RLS control plane. Every salary read
      // and outbox publication below explicitly establishes that tenant.
      const companies = await CompanyModel.findAll({
        where: { status: 'ACTIVE' },
        attributes: ['id'],
        order: [['id', 'ASC']],
      });
      for (const company of companies) {
        const companyId = company.id;
        const validations = await sequelize.transaction(async (transaction) => {
          if (sequelize.getDialect() === 'postgres')
            await sequelize.query("SELECT set_config('app.current_tenant', :id, true)", {
              replacements: { id: String(companyId) },
              type: QueryTypes.SELECT,
              transaction,
            });
          return PayrollBatch.findAll({
            where: {
              companyId,
              key: { [Op.like]: 'validation:%' },
              status: { [Op.in]: ['PENDING', 'PROCESSING'] },
            },
            limit: 2,
            transaction,
          });
        });
        for (const batch of validations) {
          if (batch.status === 'PROCESSING' && Number(batch.data.leaseUntil) > Date.now()) continue;
          await this.enqueue(
            'validate',
            companyId,
            batch.id,
            `${companyId}-validation-${batch.id}`,
          );
        }
        const pending = await sequelize.transaction(async (transaction) => {
          if (sequelize.getDialect() === 'postgres')
            await sequelize.query("SELECT set_config('app.current_tenant', :id, true)", {
              replacements: { id: String(companyId) },
              type: QueryTypes.SELECT,
              transaction,
            });
          return PayrollItem.findAll({
            where: { companyId, status: { [Op.in]: ['PENDING', 'PROCESSING'] } },
            limit: 20,
            order: [['updatedAt', 'ASC']],
            transaction,
          });
        });
        // Bounded dispatch for each tenant prevents one large payroll from
        // filling the queue ahead of all other companies.
        for (const item of pending) {
          if (item.status === 'PROCESSING' && Number(item.data.leaseUntil) > Date.now()) continue;
          await this.enqueue(
            'calculate',
            companyId,
            item.id,
            `${companyId}-${item.id}-${item.version}-${Number(item.data.attempts)}`,
          );
        }
        const exports = await sequelize.transaction(async (transaction) => {
          if (sequelize.getDialect() === 'postgres')
            await sequelize.query("SELECT set_config('app.current_tenant', :id, true)", {
              replacements: { id: String(companyId) },
              type: QueryTypes.SELECT,
              transaction,
            });
          return PayrollExport.findAll({
            where: { companyId, status: 'PENDING' },
            limit: 5,
            transaction,
          });
        });
        for (const record of exports) {
          const reader = new SequelizeMembershipReader();
          const permissions = await reader.findPermissionNames(
            companyId,
            Number(record.data.actorUserId),
          );
          if (
            permissions.includes('payroll:export') &&
            permissions.includes('payroll:results:read-sensitive')
          )
            await defaultPayrollService().buildExport(companyId, record.id);
        }
        if (process.env.PAYROLL_EVENTS_URL) await this.publish(companyId);
      }
    } finally {
      this.busy = false;
    }
  }
  private async publish(companyId: number) {
    await sequelize.transaction(async (transaction) => {
      if (sequelize.getDialect() === 'postgres')
        await sequelize.query("SELECT set_config('app.current_tenant', :id, true)", {
          replacements: { id: String(companyId) },
          type: QueryTypes.SELECT,
          transaction,
        });
      const events = await PayrollOutboxModel.findAll({
        where: { companyId, publishedAt: null },
        limit: 20,
        order: [['createdAt', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
        skipLocked: true,
      });
      for (const event of events) {
        if (event.get('eventType') === 'payroll.run.closed') {
          const payload = event.get('payload') as {
            actorUserId: number;
            results: Array<Record<string, unknown>>;
          };
          await settlePayrollLoanDeductions(
            companyId,
            String(event.get('aggregateId')),
            payload.actorUserId,
            payload.results,
          );
        }
        const response = await fetch(process.env.PAYROLL_EVENTS_URL!, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.PAYROLL_INTEGRATION_TOKEN ?? ''}`,
            'Idempotency-Key': String(event.get('id')),
          },
          body: JSON.stringify(event.toJSON()),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('Payroll event delivery failed');
        await event.update({ publishedAt: new Date() }, { transaction });
      }
    });
  }
  private async enqueue(name: string, companyId: number, itemId: string, jobId: string) {
    const existing = await this.queue!.getJob(jobId);
    if (existing) {
      if ((await existing.getState()) === 'failed') await existing.retry();
      return;
    }
    await this.queue!.add(
      name,
      { companyId, itemId },
      {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    );
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
    await this.worker?.close();
    await this.queue?.close();
  }
}
