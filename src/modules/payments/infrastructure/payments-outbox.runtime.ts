import { randomUUID } from 'crypto';
import { logger } from '../../../config/logger';
import { sequelize } from '../../../infra/database';
import { PayrollOutboxModel } from '../../payroll/infrastructure/payroll.models';
import { PayrollPaymentInboxModel } from './payment.models';

type EventHandler = { handle(message: unknown): Promise<unknown> };

/** Polls payroll's transactional outbox and records acknowledgements in a durable inbox. */
export class PaymentsOutboxRuntime {
  private timer?: NodeJS.Timeout;
  private active?: Promise<void>;
  private stopped = true;

  constructor(private readonly handler: EventHandler) {}

  start(intervalMs = 2000) {
    if (!this.stopped) return;
    this.stopped = false;
    this.timer = setInterval(() => {
      if (!this.active) this.active = this.drain().finally(() => { this.active = undefined; });
    }, intervalMs);
    this.timer.unref();
    if (!this.active) this.active = this.drain().finally(() => { this.active = undefined; });
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.active;
  }

  private async drain() {
    if (this.stopped) return;
    try {
      while (!this.stopped) {
        const completed = await PayrollPaymentInboxModel.count({ where: { eventType: 'payroll.payment-instructions.prepared', status: 'COMPLETED' } });
        const events = await PayrollOutboxModel.findAll({
          where: { eventType: 'payroll.payment-instructions.prepared' },
          order: [['createdAt', 'ASC'], ['id', 'ASC']], limit: 100, offset: completed,
        });
        if (!events.length) return;
        for (const event of events) {
          if (this.stopped) return;
          const processed = await this.processEvent(event.get({ plain: true }) as any);
          if (!processed) return;
        }
      }
    } catch (error) {
      logger.error('[payments] payroll outbox poll failed', { error: String(error) });
    }
  }

  private async processEvent(event: { id: string; companyId: number; eventType: string; payload: unknown }) {
    const transaction = await sequelize.transaction();
    let inbox;
    try {
      await PayrollPaymentInboxModel.findOrCreate({
        where: { companyId: event.companyId, sourceEventId: event.id },
        defaults: { id: randomUUID(), companyId: event.companyId, sourceEventId: event.id, eventType: event.eventType, status: 'PENDING', attempts: 0 },
        transaction,
      });
      inbox = await PayrollPaymentInboxModel.findOne({ where: { companyId: event.companyId, sourceEventId: event.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!inbox) throw new Error('Failed to claim payroll payment event.');
      if (inbox.get('status') === 'COMPLETED') { await transaction.commit(); return true; }
      const leaseUntil = inbox.get('leaseUntil') as Date | null;
      const nextAttemptAt = inbox.get('nextAttemptAt') as Date | null;
      const now = new Date();
      if ((leaseUntil && leaseUntil > now) || (nextAttemptAt && nextAttemptAt > now)) { await transaction.commit(); return false; }
      const attempts = Number(inbox.get('attempts') ?? 0) + 1;
      await inbox.update({ status: 'PROCESSING', attempts, leaseUntil: new Date(now.getTime() + 60000), nextAttemptAt: null, lastError: null }, { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    try {
      await this.handler.handle(event.payload);
      await inbox.update({ status: 'COMPLETED', processedAt: new Date(), leaseUntil: null, lastError: null });
      return true;
    } catch (error) {
      const attempts = Number(inbox.get('attempts') ?? 1);
      const delay = Math.min(300000, 1000 * (2 ** Math.min(attempts, 8)));
      await inbox.update({ status: 'FAILED', nextAttemptAt: new Date(Date.now() + delay), leaseUntil: null, lastError: String(error).slice(0, 1000) });
      logger.error('[payments] payroll payment event processing failed', { eventId: event.id, companyId: event.companyId, error: String(error) });
      return false;
    }
  }
}
