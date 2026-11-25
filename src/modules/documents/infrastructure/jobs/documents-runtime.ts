import { Queue, Worker } from 'bullmq';
import { RedisManager } from '../../../../infra/redis';
import { logger } from '../../../../config/logger';
import { SequelizeMembershipReader } from '../../../tenancy/infrastructure/persistence/readers/sequelize-membership.reader';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import { DocumentsApplicationService } from '../../application/use-cases/documents-application.service';
export class DocumentsRuntime {
  private queue?: Queue;
  private worker?: Worker;

  operationalHandles() {
    return { queue: this.queue, worker: this.worker };
  }
  private expiryTimer?: ReturnType<typeof setInterval>;
  private expiring = false;
  constructor(private readonly service: DocumentsApplicationService) {}
  start() {
    this.expiryTimer = setInterval(
      () => {
        void this.expireTenants().catch((e) =>
          logger.error('[documents] expiry sweep failed', { message: String(e) }),
        );
      },
      60 * 60 * 1000,
    );
    this.expiryTimer.unref();
    void this.expireTenants().catch((e) =>
      logger.error('[documents] initial expiry sweep failed', { message: String(e) }),
    );
    if (process.env.DOCUMENTS_WORKER_ENABLED !== 'true') return;
    if (!RedisManager.isEnabled()) throw new Error('Documents workers require Redis.');
    const r = RedisManager.client.options;
    const connection = {
      host: r.host,
      port: r.port,
      username: r.username,
      password: r.password,
      db: r.db,
      tls: r.tls,
      maxRetriesPerRequest: null,
    };
    this.queue = new Queue('documents-processing', { connection });
    this.service.setEnqueuer(async (companyId, kind, id, actor) => {
      const jobId = `documents-${kind.toLowerCase()}-${companyId}-${id}`;
      const old = await this.queue!.getJob(jobId);
      if (old) {
        if ((await old.getState()) === 'failed') await old.retry();
        return;
      }
      await this.queue!.add(
        kind === 'SCAN' ? 'scan-upload' : 'delete-document',
        { companyId, kind, id, actor },
        {
          jobId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      );
    });
    const memberships = new SequelizeMembershipReader();
    this.worker = new Worker(
      'documents-processing',
      async (job) => {
        const companyId = Number(job.data.companyId),
          actor = Number(job.data.actor),
          id = String(job.data.id);
        if (
          !Number.isSafeInteger(companyId) ||
          companyId <= 0 ||
          !Number.isSafeInteger(actor) ||
          actor <= 0
        )
          throw new Error('Invalid documents worker context.');
        const member = await memberships.findMembership(companyId, actor),
          perms = await memberships.findPermissionNames(companyId, actor);
        const permission =
          job.data.kind === 'DELETE' ? 'documents:deletion:approve' : 'documents:upload';
        if (
          !member ||
          member.memberStatus !== 'ACTIVE' ||
          member.companyStatus !== 'ACTIVE' ||
          !perms.includes(permission)
        )
          throw new Error('Documents worker authorization revoked.');
        if (job.data.kind === 'SCAN') return this.service.processUpload(companyId, id);
        return this.service.processDeletion(companyId, id);
      },
      { connection, concurrency: 4, limiter: { max: 20, duration: 1000 } },
    );
    this.worker.on('error', (e) =>
      logger.error('[documents] worker error', { message: e.message }),
    );
  }
  private async expireTenants() {
    if (this.expiring) return;
    this.expiring = true;
    try {
      const companies = await CompanyModel.findAll({
        where: { status: 'ACTIVE' },
        attributes: ['id'],
        order: [['id', 'ASC']],
      });
      for (const company of companies) await this.service.markExpired(Number(company.id));
    } finally {
      this.expiring = false;
    }
  }
  async stop() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
    await this.worker?.close();
    await this.queue?.close();
  }
}
