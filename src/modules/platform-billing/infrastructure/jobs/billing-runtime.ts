import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../../../infra/database/index';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import { BillingRecord } from '../persistence/models/billing-record.model';
import { logger } from '../../../../config/logger';
import { BillingCommercialService } from '../../application/use-cases/billing-commercial.service';
export class BillingRuntime {
  constructor(
    private service: BillingCommercialService,
    private applySubscriptionEvent?: (event: any) => Promise<any>,
    private readSubscription?: (companyId: number) => Promise<any>,
  ) {}
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  start() {
    this.timer = setInterval(() => {
      void this.tick().catch((e) =>
        logger.error('[platform-billing] dispatch failed', { message: String(e) }),
      );
    }, 30000);
    this.timer.unref();
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const url = process.env.PLATFORM_BILLING_EVENTS_URL;
      const companies = await CompanyModel.findAll({ attributes: ['id'] });
      for (const company of companies) {
        try {
          if (this.readSubscription)
            await this.service.syncContract(
              Number(company.id),
              await this.readSubscription(Number(company.id)),
            );
          await this.service.runSchedules(Number(company.id));
          await this.service.overdue(Number(company.id));
        } catch (error) {
          logger.error('[platform-billing] tenant cycle failed', {
            companyId: company.id,
            message: String(error),
          });
        }
      }
      for (const company of companies)
        await sequelize.transaction(async (tx) => {
          await sequelize.query("SELECT set_config('app.current_tenant', :tenant, true)", {
            replacements: { tenant: String(company.id) },
            type: QueryTypes.SELECT,
            transaction: tx,
          });
          const events = await BillingRecord.findAll({
            where: {
              companyId: company.id,
              kind: 'OUTBOX',
              status: { [Op.in]: ['PENDING', 'RETRY'] },
            },
            limit: 20,
            transaction: tx,
            lock: tx.LOCK.UPDATE,
            skipLocked: true,
          });
          for (const event of events) {
            if (event.data.nextAttemptAt && event.data.nextAttemptAt > Date.now()) continue;
            try {
              const supported = [
                'platform-billing.invoice.overdue',
                'platform-billing.payment.failed',
                'platform-billing.payment.confirmed',
                'platform-billing.payment.allocated',
              ].includes(event.data.event);
              if (
                this.applySubscriptionEvent &&
                supported &&
                event.data.subscriptionId &&
                (!['platform-billing.payment.confirmed', 'platform-billing.payment.allocated'].includes(event.data.event) ||
                  event.data.settled === true)
              )
                await this.applySubscriptionEvent({
                  eventId: event.id,
                  type: event.data.event === 'platform-billing.payment.allocated' ? 'platform-billing.payment.confirmed' : event.data.event,
                  companyId: Number(company.id),
                  subscriptionId: event.data.subscriptionId,
                  invoiceId: event.data.invoiceId,
                });
              if (url) {
                const response = await fetch(url, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': event.id,
                    ...(process.env.PLATFORM_BILLING_EVENTS_TOKEN
                      ? { Authorization: `Bearer ${process.env.PLATFORM_BILLING_EVENTS_TOKEN}` }
                      : {}),
                  },
                  body: JSON.stringify({ eventId: event.id, companyId: company.id, ...event.data }),
                  signal: AbortSignal.timeout(10000),
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
              }
              await event.update(
                { status: url ? 'PUBLISHED' : 'PROCESSED_INTERNAL' },
                { transaction: tx },
              );
            } catch (error) {
              const attempts = Number(event.data.attempts || 0) + 1;
              await event.update(
                {
                  status: attempts >= 10 ? 'DEAD' : 'RETRY',
                  data: {
                    ...event.data,
                    attempts,
                    lastError: String(error),
                    nextAttemptAt: Date.now() + Math.min(3600000, 1000 * 2 ** attempts),
                  },
                },
                { transaction: tx },
              );
            }
          }
        });
    } finally {
      this.running = false;
    }
  }
}
