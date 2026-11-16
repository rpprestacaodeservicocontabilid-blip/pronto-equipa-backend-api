import { CronJob } from 'cron';
import { logger } from '../../../../config/logger';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import { SequelizeContractRepository } from '../persistence/repositories/sequelize-contract.repository';

export class ContractExpirationJob {
  private readonly repository = new SequelizeContractRepository();
  private readonly job = new CronJob(
    '0 0 2 * * *',
    () => {
      void this.run().catch((error: unknown) => {
        logger.error('[contracts] expiration alert job failed', { err: error });
      });
    },
    null,
    false,
    'Africa/Luanda',
  );

  start(): void {
    this.job.start();
  }

  stop(): void {
    this.job.stop();
  }

  async run(
    asOfDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Luanda' }).format(new Date()),
  ): Promise<number> {
    const companies = await CompanyModel.findAll({
      attributes: ['id'],
      where: { status: 'ACTIVE' },
    });
    let generated = 0;
    for (const company of companies) {
      await this.repository.expireEndedContracts(company.id, asOfDate);
      generated += await this.repository.generateExpirationAlerts(company.id, asOfDate);
    }
    return generated;
  }
}
