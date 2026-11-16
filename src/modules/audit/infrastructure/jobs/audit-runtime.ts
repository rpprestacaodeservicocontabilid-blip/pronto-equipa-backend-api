import { sequelize } from '../../../../infra/database';
import { logger } from '../../../../config/logger';
import { AuditServices } from '../../application/use-cases/audit-services';
import { AuditNotificationPort } from '../../application/ports/audit-engine.ports';
import { AuditAccess, AuditScope, auditScope } from '../../domain/audit-contracts';
type Authorize = (actor: number, company: number | null, permission: string) => Promise<boolean>;

/** The database outbox is durable; polling may be restarted without losing a captured event. */
export class AuditRuntime {
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  constructor(
    private readonly services: AuditServices,
    private readonly authorize: Authorize,
    private notifications?: AuditNotificationPort,
  ) {}
  setNotifications(port: AuditNotificationPort) {
    this.notifications = port;
  }
  async start() {
    if (process.env.AUDIT_WORKER_ENABLED !== 'true') {
      if (process.env.NODE_ENV === 'production')
        throw new Error('AUDIT_WORKER_ENABLED=true is required in production.');
      return;
    }
    if (process.env.NODE_ENV === 'production') {
      if (sequelize.getDialect() !== 'postgres')
        throw new Error('Production audit capture and RLS require PostgreSQL.');
      if (!process.env.AUDIT_ANCHOR_ROOT || !process.env.AUDIT_SIGNING_PRIVATE_KEY)
        throw new Error('Audit signing and independent anchoring must be configured.');
      this.services.core.crypto.sign('audit-startup-check');
      if (!(await sequelize.getQueryInterface().tableExists('audit_scope_catalog')))
        throw new Error('Apply the audit migrations before startup.');
    }
    const interval = Number(process.env.AUDIT_POLL_INTERVAL_MS || 10000);
    if (!Number.isSafeInteger(interval) || interval < 1000)
      throw new Error('Invalid audit polling interval.');
    const tick = () => {
      if (!this.active)
        this.active = this.runOnce()
          .catch(() => {
            logger.error('[audit] worker cycle failed');
          })
          .finally(() => {
            this.active = undefined;
          });
    };
    this.timer = setInterval(tick, interval);
    this.timer.unref();
    tick();
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    await this.active;
    this.timer = undefined;
  }
  async runOnce() {
    const scopes = [auditScope(null), ...(await this.services.core.repository.scopes())];
    for (const scope of new Map(scopes.map((s) => [s.scopeKey, s])).values()) {
      try {
        await this.process(scope);
      } catch {
        logger.error('[audit] scope processing failed', { scopeKey: scope.scopeKey });
      }
    }
  }
  private async process(scope: AuditScope) {
    const s = this.services;
    await s.monitor.drain(scope);
    await s.monitor.retryDue(scope);
    await s.monitor.evaluate(scope);
    for (const request of await s.core.list(scope, 'EXPORT'))
      if (
        request.status === 'APPROVED' ||
        (request.status === 'PROCESSING' && Number(request.data.leaseUntil) < Date.now())
      ) {
        const actorId = Number(request.data.requesterId),
          permitted = await this.authorize(actorId, scope.companyId, 'audit:exports:create');
        if (!permitted) continue;
        const access: AuditAccess = {
          ...scope,
          actorId,
          purpose: String(request.data.purpose),
          sensitive: await this.authorize(actorId, scope.companyId, 'audit:records:read-sensitive'),
        };
        if (
          !(await this.authorize(
            actorId,
            scope.companyId,
            scope.companyId === null ? 'audit:records:read-platform' : 'audit:records:read-tenant',
          ))
        )
          continue;
        try {
          await s.exports.execute(access, request.id);
        } catch {
          logger.error('[audit] approved export processing failed', { requestId: request.id });
        }
      }
    if (this.notifications)
      for (const alert of await s.core.list(scope, 'ALERT'))
        if (alert.status === 'OPEN' && !alert.data.notifiedAt) {
          await this.notifications.alert(scope, alert.id, String(alert.data.severity || 'HIGH'));
          await s.core.repository.transaction(scope, (tx) =>
            s.core.repository.updateObject(
              alert,
              { data: { ...alert.data, notifiedAt: new Date().toISOString() } },
              tx,
            ),
          );
        }
    // The outbox advertises durable local persistence. External delivery is tracked separately on alerts.
    for (const entry of await s.core.list(scope, 'OUTBOX'))
      if (entry.status === 'PENDING')
        await s.core.repository.transaction(scope, (tx) =>
          s.core.repository.updateObject(entry, { status: 'PERSISTED' }, tx),
        );
    if (process.env.AUDIT_SIGNING_PRIVATE_KEY && process.env.AUDIT_ANCHOR_ROOT) {
      const checkpoints = await s.core.list(scope, 'CHECKPOINT');
      const latest = checkpoints.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!latest || Date.now() - new Date(latest.createdAt).getTime() > 3600000) {
        await s.integrity.verify(scope);
        await s.integrity.checkpoint({
          ...scope,
          actorId: 0,
          purpose: 'Scheduled integrity checkpoint',
          sensitive: true,
        });
      }
    }
  }
}
