import { Queue, Worker } from 'bullmq';
import { RedisManager } from '../../../../infra/redis';
import { logger } from '../../../../config/logger';
import { SequelizeMembershipReader } from '../../../tenancy/infrastructure/persistence/readers/sequelize-membership.reader';
import { SimulationsApplicationService } from '../../application/use-cases/simulations-application.service';

export class SimulationsRuntime {
  private queue?: Queue;
  private worker?: Worker;
  constructor(private readonly service: SimulationsApplicationService) {}
  start() {
    if (process.env.SIMULATIONS_WORKER_ENABLED !== 'true') return;
    if (!RedisManager.isEnabled())
      throw new Error('Simulation workers require an available Redis connection.');
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
    this.queue = new Queue('simulation-execution', { connection });
    this.service.setEnqueuer(async (companyId, actorUserId, runId) => {
      await this.queue!.add(
        'execute-run',
        { companyId, actorUserId, runId },
        {
          jobId: `simulation-${companyId}-${runId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 2000,
        },
      );
    });
    const reader = new SequelizeMembershipReader();
    this.worker = new Worker(
      'simulation-execution',
      async (job) => {
        const companyId = Number(job.data.companyId),
          actor = Number(job.data.actorUserId),
          runId = String(job.data.runId);
        if (
          !Number.isSafeInteger(companyId) ||
          companyId <= 0 ||
          !Number.isSafeInteger(actor) ||
          actor <= 0
        )
          throw new Error('Invalid simulation tenant or actor context.');
        const [membership, permissions, run] = await Promise.all([
          reader.findMembership(companyId, actor),
          reader.findPermissionNames(companyId, actor),
          this.service.getRun(companyId, runId),
        ]);
        if (
          !membership ||
          membership.memberStatus !== 'ACTIVE' ||
          membership.companyStatus !== 'ACTIVE' ||
          !permissions.includes('simulations:runs:execute') ||
          !permissions.includes('simulations:salary:read-sensitive')
        )
          throw new Error('Simulation execution authorization revoked.');
        if (
          Number(run.employeeIds?.length || 0) > 1 &&
          !permissions.includes('simulations:bulk:execute')
        )
          throw new Error('Bulk simulation authorization revoked.');
        await this.service.processRun(companyId, runId);
      },
      { connection, concurrency: 4, limiter: { max: 20, duration: 1000 } },
    );
    this.worker.on('error', (error) =>
      logger.error('[simulations] worker error', { message: error.message }),
    );
  }
  async stop() {
    this.service.setEnqueuer(undefined);
    await this.worker?.close();
    await this.queue?.close();
  }
}
