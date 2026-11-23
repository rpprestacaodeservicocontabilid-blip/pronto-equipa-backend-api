import { sequelize } from '../../../../infra/database';
import { QueryTypes } from 'sequelize';
import { Op, WhereOptions } from 'sequelize';
import { AuditEventSourcePort } from '../../application/ports/audit-engine.ports';
import {
  AuditCategory,
  AuditEventInput,
  AuditScope,
  auditData,
} from '../../domain/audit-contracts';
import { AuditCaptureModel } from '../persistence/models/audit-engine.models';
import { auditChanges } from '../../domain/services/audit-data.service';
const sourceCategories: Record<string, AuditCategory> = {
  communication_records: 'INTEGRATION',
  payroll_runs: 'PAYROLL',
  payroll_employee_results: 'PAYROLL',
  employee_salary_assignments: 'PAYROLL',
  payroll_payment_batches: 'FINANCIAL',
  payroll_payment_approvals: 'FINANCIAL',
  payroll_payment_transactions: 'FINANCIAL',
  payment_instructions: 'FINANCIAL',
  roles: 'AUTHORIZATION',
  role_permissions: 'AUTHORIZATION',
  company_members: 'AUTHORIZATION',
  platform_billing_records: 'FINANCIAL',
  legal_rule_sets: 'COMPLIANCE',
  employment_contracts: 'DATA_CHANGE',
};
export class DatabaseAuditEventSource implements AuditEventSourcePort {
  async status(scope: AuditScope): Promise<{ pending: number; oldestPendingAt: string | null }> {
    return sequelize.transaction(async (transaction) => {
      if (sequelize.getDialect() === 'postgres')
        await sequelize.query("SELECT set_config('app.current_tenant',:tenant,true)", {
          replacements: { tenant: scope.companyId === null ? '' : String(scope.companyId) },
          type: QueryTypes.SELECT,
          transaction,
        });
      const where = { companyId: scope.companyId, processedAt: null };
      const pending = await AuditCaptureModel.count({ where, transaction });
      const oldest = await AuditCaptureModel.findOne({
        where,
        transaction,
        attributes: ['occurredAt'],
        order: [
          ['occurredAt', 'ASC'],
          ['id', 'ASC'],
        ],
      });
      return {
        pending,
        oldestPendingAt: oldest ? new Date(oldest.getDataValue('occurredAt')).toISOString() : null,
      };
    });
  }
  async acknowledge(scope: AuditScope, ids: string[]) {
    if (!ids.length) return;
    await sequelize.transaction(async (transaction) => {
      if (sequelize.getDialect() === 'postgres')
        await sequelize.query("SELECT set_config('app.current_tenant',:tenant,true)", {
          replacements: { tenant: scope.companyId === null ? '' : String(scope.companyId) },
          type: QueryTypes.SELECT,
          transaction,
        });
      await AuditCaptureModel.update(
        { processedAt: new Date() },
        { where: { companyId: scope.companyId, id: { [Op.in]: ids } }, transaction },
      );
    });
  }
  async scan(scope: AuditScope, cursor: string | null, limit: number, reconcile = false) {
    const where: Record<string | symbol, unknown> = { companyId: scope.companyId };
    if (!reconcile) where.processedAt = null;
    if (cursor && reconcile) {
      const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      const position = auditData(parsed);
      if (typeof position.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(position.id))
        throw new Error('Invalid audit source cursor.');
      // UUID ordering preserves an exact cursor without truncating PostgreSQL microseconds.
      where.id = { [Op.gt]: position.id };
    }
    const rows = await sequelize.transaction(async (transaction) => {
      if (sequelize.getDialect() === 'postgres')
        await sequelize.query("SELECT set_config('app.current_tenant',:tenant,true)", {
          replacements: { tenant: scope.companyId === null ? '' : String(scope.companyId) },
          type: QueryTypes.SELECT,
          transaction,
        });
      return AuditCaptureModel.findAll({
        transaction,
        where: where as WhereOptions,
        order: reconcile
          ? [['id', 'ASC']]
          : [
              ['occurredAt', 'ASC'],
              ['id', 'ASC'],
            ],
        limit,
      });
    });
    const events = rows.map((model) => {
      const row = model.get({ plain: true });
      const occurredAt = new Date(row.occurredAt).toISOString();
      const position = Buffer.from(JSON.stringify({ occurredAt, id: row.id })).toString(
        'base64url',
      );
      const input: AuditEventInput = {
        eventId: row.id,
        eventType: row.eventType,
        sourceId: 'database',
        category:
          sourceCategories[row.resourceType] ||
          (/payslip|salary|payroll/.test(row.resourceType)
            ? 'PAYROLL'
            : /payment|billing|subscription|loan/.test(row.resourceType)
              ? 'FINANCIAL'
              : /document/.test(row.resourceType)
                ? 'DOCUMENT'
                : /auth|user_roles|user_permissions/.test(row.resourceType)
                  ? 'SECURITY'
                  : 'DATA_CHANGE'),
        severity:
          row.resourceType === 'communication_records'
            ? 'LOW'
            : /payroll_runs|payroll_approvals|payment|billing|roles|permissions|legal_rule_sets/.test(
                  row.resourceType,
                )
              ? 'CRITICAL'
              : 'HIGH',
        scope: row.companyId === null ? 'PLATFORM' : 'TENANT',
        tenantId: row.companyId === null ? undefined : String(row.companyId),
        actor: row.actorId
          ? { actorType: 'USER', actorId: row.actorId }
          : { actorType: 'SYSTEM', actorId: 'database-capture' },
        action: row.eventType,
        changes: auditChanges(row.payload.before, row.payload.after),
        resource: { resourceType: row.resourceType, resourceId: row.resourceId },
        outcome: 'SUCCESS',
        occurredAt,
        correlationId: row.correlationId || undefined,
        metadata: { ...row.payload, actorIdentified: row.actorId !== null },
      };
      return { cursor: position, input };
    });
    return { events, next: events[events.length - 1]?.cursor || cursor };
  }
}
