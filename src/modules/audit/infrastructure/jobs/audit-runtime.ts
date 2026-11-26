import { Queue, Worker, Job } from 'bullmq';
import { z } from 'zod';
import { sequelize } from '../../../../infra/database';
import { QueryTypes } from 'sequelize';
import { RedisManager } from '../../../../infra/redis';
import { logger } from '../../../../config/logger';
import { AuditServices } from '../../application/use-cases/audit-services';
import { AuditNotificationPort } from '../../application/ports/audit-engine.ports';
import { AuditAccess, AuditScope, auditScope } from '../../domain/audit-contracts';
import { AuditEventPublisherPort } from '../../application/ports/audit-event-publisher.port';
import { AuditEventDeliveryService } from '../../application/use-cases/audit-event-delivery.service';
type Authorize = (actor: number, company: number | null, permission: string) => Promise<boolean>;
const stages = [
  'ingestion',
  'integrity',
  'retention',
  'archive',
  'exports',
  'reconciliation',
  'alerts',
  'evidence',
] as const;
type Stage = (typeof stages)[number];
const task = z.object({
  companyId: z.number().int().positive().nullable(),
  policyId: z.string().uuid().optional(),
});
/** Database capture is authoritative; queue jobs schedule replayable work. */
export class AuditRuntime {
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private queues = new Map<Stage, Queue>();
  private workers: Worker[] = [];
  constructor(
    private readonly services: AuditServices,
    private readonly authorize: Authorize,
    private notifications?: AuditNotificationPort,
    private readonly publisher?: AuditEventPublisherPort,
  ) {}
  setNotifications(port: AuditNotificationPort): void {
    this.notifications = port;
  }
  async start(): Promise<void> {
    if (this.timer) return;
    if (process.env.AUDIT_WORKER_ENABLED !== 'true') {
      if (process.env.NODE_ENV === 'production')
        throw new Error('AUDIT_WORKER_ENABLED=true is required in production.');
      return;
    }
    if (process.env.NODE_ENV === 'production') {
      const dialect = sequelize.getDialect();
      if (dialect !== 'postgres' && dialect !== 'mysql')
        throw new Error('Production audit requires MySQL or PostgreSQL.');
      if (!process.env.AUDIT_ANCHOR_ROOT || !process.env.AUDIT_SIGNING_PRIVATE_KEY)
        throw new Error('Configure audit signing and independent anchoring.');
      if (!process.env.AUDIT_ALERT_RECIPIENTS_JSON)
        throw new Error('Configure authorized audit alert recipients.');
      this.services.core.crypto.sign('audit-startup-check');
      if (!(await sequelize.getQueryInterface().tableExists('audit_scope_catalog')))
        throw new Error('Apply the audit migrations before startup.');
      let triggerNames: Set<string>;
      if (dialect === 'postgres') {
      const protections = await sequelize.query<{ name: string; rls: boolean; forced: boolean }>(
        "SELECT relname AS name,relrowsecurity AS rls,relforcerowsecurity AS forced FROM pg_class WHERE oid IN ('audit_records'::regclass,'audit_chain_heads'::regclass,'audit_capture_events'::regclass)",
        { type: QueryTypes.SELECT },
      );
      if (protections.length !== 3 || protections.some((p) => !p.rls || !p.forced))
        throw new Error('Required audit RLS protections are missing.');
      const roles = await sequelize.query<{ superuser: boolean; bypass: boolean }>(
        'SELECT rolsuper AS superuser,rolbypassrls AS bypass FROM pg_roles WHERE rolname=current_user',
        { type: QueryTypes.SELECT },
      );
      if (!roles.length || roles[0].superuser || roles[0].bypass)
        throw new Error('Audit runtime role must not bypass RLS.');
      const privileges = await sequelize.query<{ directInsert: boolean; owns: boolean }>(
        "SELECT has_table_privilege(current_user,'audit_capture_events','INSERT') AS \"directInsert\",EXISTS(SELECT 1 FROM pg_class WHERE oid='audit_records'::regclass AND pg_has_role(current_user,relowner,'MEMBER')) AS owns",
        { type: QueryTypes.SELECT },
      );
      if (!privileges.length || privileges[0].directInsert || privileges[0].owns)
        throw new Error(
          'Audit runtime requires a separate non-owner role without direct capture INSERT privilege.',
        );
      const triggers = await sequelize.query<{ name: string }>(
        "SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'",
        { type: QueryTypes.SELECT },
      );
      triggerNames = new Set(triggers.map((t) => t.name));
      } else {
        const schema = String(sequelize.config.database || '');
        const triggers = await sequelize.query<{ name: string }>(
          'SELECT name FROM audit_trigger_inventory',
          { type: QueryTypes.SELECT },
        );
        triggerNames = new Set(triggers.map((t) => t.name));
        const grants = await sequelize.query<Record<string, string>>('SHOW GRANTS', {
          type: QueryTypes.SELECT,
        });
        const grantText = grants.flatMap((row) => Object.values(row)).join('\n').toUpperCase();
        if (/GRANT OPTION|ALL PRIVILEGES ON|SUPER|SYSTEM_USER|CREATE USER|TRIGGER ON/.test(grantText))
          throw new Error('MySQL audit runtime account has excessive privileges.');
        const protectedGrants = await sequelize.query<{ tableName: string; privilege: string }>(
          "SELECT TABLE_NAME AS tableName,PRIVILEGE_TYPE AS privilege FROM information_schema.TABLE_PRIVILEGES WHERE TABLE_SCHEMA=:schema AND ((TABLE_NAME='audit_records' AND PRIVILEGE_TYPE IN ('UPDATE','DELETE','TRIGGER','ALTER','DROP','REFERENCES')) OR (TABLE_NAME='audit_record_identities' AND PRIVILEGE_TYPE IN ('INSERT','UPDATE','DELETE','TRIGGER','ALTER','DROP','REFERENCES')) OR (TABLE_NAME='audit_capture_events' AND PRIVILEGE_TYPE IN ('INSERT','DELETE','TRIGGER','ALTER','DROP','REFERENCES')))",
          { replacements: { schema }, type: QueryTypes.SELECT },
        );
        if (protectedGrants.length)
          throw new Error('MySQL audit runtime account has write access to protected audit evidence.');
      }
      for (const table of [
        'companies',
        'company_members',
        'roles',
        'role_permissions',
        'employment_contracts',
        'employee_salary_assignments',
        'payroll_runs',
        'payroll_employee_results',
        'payment_instructions',
        'payroll_payment_batches',
        'payroll_payment_approvals',
        'payroll_payment_transactions',
        'platform_billing_records',
      ])
        if (
          dialect === 'postgres'
            ? !triggerNames.has(`audit_capture_${table}`)
            : !['insert', 'update', 'delete'].every((operation) =>
                triggerNames.has(`audit_capture_${table}_${operation}`),
              )
        )
          throw new Error(`Critical audit capture missing: ${table}`);
      if (
        dialect === 'postgres'
          ? !triggerNames.has('audit_record_immutable') || !triggerNames.has('audit_record_no_truncate')
          : !triggerNames.has('audit_records_update_immutable') ||
            !triggerNames.has('audit_records_delete_immutable')
      )
        throw new Error('Audit immutability protections are missing.');
      if (process.env.AUDIT_QUEUE_ENABLED !== 'true')
        throw new Error('Production audit requires AUDIT_QUEUE_ENABLED=true.');
    }
    const interval = Number(process.env.AUDIT_POLL_INTERVAL_MS || 10000);
    if (!Number.isSafeInteger(interval) || interval < 1000)
      throw new Error('Invalid audit polling interval.');
    if (process.env.AUDIT_QUEUE_ENABLED === 'true') {
      if (!RedisManager.isEnabled()) throw new Error('Audit queues require Redis.');
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
      for (const stage of stages) {
        const name = `audit.${stage}`;
        const queue = new Queue(name, {
          connection,
          defaultJobOptions: {
            attempts: 8,
            backoff: { type: 'exponential', delay: 10000 },
            removeOnComplete: 100,
            removeOnFail: 1000,
          },
        });
        const worker = new Worker(
          name,
          async (job: Job<unknown>) => {
            const input = task.parse(job.data);
            await this.perform(stage, auditScope(input.companyId), input.policyId);
          },
          { connection, concurrency: 1 },
        );
        worker.on('error', () => logger.error('[audit] queue connection failed', { stage }));
        worker.on('failed', (job) =>
          logger.error('[audit] job failed', {
            stage,
            jobId: job?.id,
            attempts: job?.attemptsMade,
          }),
        );
        this.queues.set(stage, queue);
        this.workers.push(worker);
      }
    }
    const tick = () => {
      if (!this.active)
        this.active = this.runOnce()
          .catch(() => {
            logger.error('[audit] scheduler cycle failed');
          })
          .finally(() => {
            this.active = undefined;
          });
    };
    this.timer = setInterval(tick, interval);
    this.timer.unref();
    tick();
  }
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.active;
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.timer = undefined;
    this.workers = [];
    this.queues.clear();
  }
  async runOnce(): Promise<void> {
    const scopes = [auditScope(null), ...(await this.services.core.repository.scopes())];
    for (const scope of new Map(scopes.map((s) => [s.scopeKey, s])).values())
      for (const stage of stages.filter((s) => s !== 'archive')) {
        const queue = this.queues.get(stage);
        if (queue) {
          const bucket = Math.floor(
            Date.now() / (['ingestion', 'exports', 'alerts'].includes(stage) ? 10000 : 3600000),
          );
          await queue.add(
            stage,
            { companyId: scope.companyId },
            { jobId: `${scope.scopeKey.replace(':', '-')}-${bucket}` },
          );
        } else
          try {
            await this.perform(stage, scope);
          } catch {
            logger.error('[audit] processing stage failed', { scopeKey: scope.scopeKey, stage });
          }
      }
  }
  private technical(scope: AuditScope, purpose: string): AuditAccess {
    return { ...scope, actorId: 0, purpose, sensitive: true };
  }
  private async perform(stage: Stage, scope: AuditScope, policyId?: string): Promise<void> {
    const s = this.services;
    switch (stage) {
      case 'ingestion':
        await s.monitor.drain(scope);
        await s.monitor.retryDue(scope);
        if (this.publisher)
          await new AuditEventDeliveryService(s.core, this.publisher).drain(scope);
        break;
      case 'exports':
        await this.processExports(scope);
        break;
      case 'alerts':
        await s.monitor.evaluate(scope);
        await this.notify(scope);
        break;
      case 'reconciliation': {
        const runs = await s.core.list(scope, 'RECONCILIATION'),
          latest = runs[runs.length - 1];
        if (
          !latest ||
          latest.data.complete === false ||
          Date.now() - new Date(latest.createdAt).getTime() > 86400000
        )
          await s.monitor.drain(scope, true);
        break;
      }
      case 'integrity': {
        if (!process.env.AUDIT_SIGNING_PRIVATE_KEY || !process.env.AUDIT_ANCHOR_ROOT) return;
        const checkpoints = await s.core.list(scope, 'CHECKPOINT'),
          latest = checkpoints[checkpoints.length - 1];
        if (!latest || Date.now() - new Date(latest.createdAt).getTime() > 3600000) {
          const result = await s.integrity.verify(scope);
          if (!result.valid) throw new Error('Compromised chain: checkpoint refused.');
          await s.integrity.checkpoint(this.technical(scope, 'Scheduled integrity checkpoint'));
        }
        break;
      }
      case 'retention':
        for (const policy of await s.core.list(scope, 'RETENTION'))
          if (policy.status === 'ACTIVE' && policy.data.automatic === true) {
            const queue = this.queues.get('archive');
            if (queue)
              await queue.add(
                'archive',
                { companyId: scope.companyId, policyId: policy.id },
                { jobId: `${policy.id}-${new Date().toISOString().slice(0, 10)}` },
              );
            else await this.perform('archive', scope, policy.id);
          }
        break;
      case 'archive': {
        if (!policyId) throw new Error('Archive policy required.');
        const policy = await s.core.objectData(scope, 'RETENTION', policyId);
        if (policy.status === 'ACTIVE' && policy.data.automatic === true)
          await s.retention.execute(
            this.technical(scope, 'Scheduled approved retention archival'),
            policyId,
          );
        break;
      }
      case 'evidence':
        for (const row of await s.core.list(scope, 'EVIDENCE', {
          status: ['READY'],
          limit: 1000,
          beforeUpdatedAt: new Date(Date.now() - 86400000).toISOString(),
        })) {
          if (
            row.status !== 'READY' ||
            (row.data.lastVerifiedAt &&
              Date.now() - new Date(String(row.data.lastVerifiedAt)).getTime() < 86400000)
          )
            continue;
          const result = await s.evidence.verify(
            this.technical(scope, 'Scheduled evidence verification'),
            row.id,
          );
          await s.core.repository.transaction(scope, async (tx) => {
            const current = await s.core.requireObject(scope, 'EVIDENCE', row.id, tx);
            await s.core.repository.updateObject(
              current,
              {
                data: {
                  ...current.data,
                  lastVerifiedAt: new Date().toISOString(),
                  integrity: result.valid ? 'VALID' : 'VIOLATION',
                },
              },
              tx,
            );
            if (!result.valid)
              await s.core.createObject(
                scope,
                'ALERT',
                `evidence:${row.id}:${new Date().toISOString().slice(0, 10)}`,
                'OPEN',
                { severity: 'CRITICAL', evidenceId: row.id, type: 'EVIDENCE_INTEGRITY_VIOLATION' },
                tx,
              );
          });
        }
        break;
    }
  }
  private async processExports(scope: AuditScope): Promise<void> {
    const s = this.services;
    for (const row of await s.core.list(scope, 'EXPORT', {
      status: ['APPROVED', 'PROCESSING'],
      limit: 1000,
    })) {
      if (
        row.status !== 'APPROVED' &&
        !(row.status === 'PROCESSING' && Number(row.data.leaseUntil) < Date.now())
      )
        continue;
      const actor = Number(row.data.requesterId),
        approver = Number(row.data.approverId),
        read =
          scope.companyId === null ? 'audit:records:read-platform' : 'audit:records:read-tenant';
      if (
        !(await this.authorize(actor, scope.companyId, 'audit:exports:create')) ||
        !(await this.authorize(actor, scope.companyId, read))
      )
        continue;
      if (
        !Number.isSafeInteger(approver) ||
        approver === actor ||
        !(await this.authorize(approver, scope.companyId, 'audit:exports:approve'))
      )
        continue;
      const access = {
        ...scope,
        actorId: actor,
        purpose: String(row.data.purpose),
        sensitive: await this.authorize(actor, scope.companyId, 'audit:records:read-sensitive'),
      };
      if (
        row.data.sensitive === true &&
        (!access.sensitive ||
          !(await this.authorize(approver, scope.companyId, 'audit:records:read-sensitive')))
      )
        continue;
      await s.exports.execute(access, row.id);
    }
  }
  private async notify(scope: AuditScope): Promise<void> {
    if (!this.notifications) return;
    for (const alert of await this.services.core.list(scope, 'ALERT', {
      status: ['OPEN'],
      unnotified: true,
      limit: 1000,
    }))
      if (alert.status === 'OPEN' && !alert.data.notifiedAt) {
        await this.notifications.alert(scope, alert.id, String(alert.data.severity || 'HIGH'));
        await this.services.core.repository.transaction(scope, async (tx) => {
          const current = await this.services.core.requireObject(scope, 'ALERT', alert.id, tx);
          await this.services.core.repository.updateObject(
            current,
            { data: { ...current.data, notifiedAt: new Date().toISOString() } },
            tx,
          );
        });
      }
  }
}
