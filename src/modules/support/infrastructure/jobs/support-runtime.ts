import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import { SupportApplicationService } from '../../application/use-cases/support-application.service';
import { logger } from '../../../../config/logger';

export class SupportRuntime {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly service: SupportApplicationService) {}

  start() {
    this.timer = setInterval(() => void this.tick(), 30000);
    this.timer.unref();
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const companies = await CompanyModel.findAll({ attributes: ['id'] });
      for (const company of companies) await this.service.sweep(Number(company.id));
    } catch (error) {
      logger.error('[support] SLA monitor failed', { message: String(error) });
    } finally {
      this.running = false;
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
