import { Op } from 'sequelize';
import { OnboardingApplication } from '../persistence/models/onboarding.model';
import { OnboardingResourcesService as OnboardingService } from '../../application/use-cases/onboarding-resources.service';
import { logger } from '../../../../config/logger';
export class OnboardingRuntime {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private service: OnboardingService) {}
  start() {
    this.timer = setInterval(() => {
      void this.tick();
    }, 60000);
    this.timer.unref();
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.service.processImports();
      await this.service.communicate();
      const rows = await OnboardingApplication.findAll({
        where: { status: { [Op.in]: ['AWAITING_PAYMENT', 'PROVISIONING'] } },
        limit: 100,
        order: [['updatedAt', 'ASC']],
      });
      for (const row of rows) {
        if (row.status === 'PROVISIONING' && Number(row.data.leaseUntil) > Date.now()) continue;
        try {
          if (row.status === 'AWAITING_PAYMENT') {
            const sub = await this.service.billingStatus(row.id, row.ownerId);
            if (!sub || !['ACTIVE', 'TRIALING'].includes(sub.status)) continue;
          }
          await this.service.provision(row.id, row.ownerId);
        } catch (error) {
          logger.error('[onboarding] recovery failed', {
            applicationId: row.id,
            message: String(error),
          });
        }
      }
    } catch (error) {
      logger.error('[onboarding] sweep failed', { message: String(error) });
    } finally {
      this.running = false;
    }
  }
}
