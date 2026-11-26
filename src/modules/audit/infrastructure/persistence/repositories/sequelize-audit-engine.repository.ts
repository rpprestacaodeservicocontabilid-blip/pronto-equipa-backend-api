import { Op, Transaction, WhereOptions, QueryTypes } from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import {
  recordTransactionTenant,
  resolveRecordTransaction,
  withRecordTransaction,
} from '../../../../../shared/infrastructure/persistence/sequelize-record-store';
import { RecordStoreContext } from '../../../../../shared/application/ports/record-store.port';
import {
  AuditRepositoryPort,
  AuditObjectFilter,
} from '../../../application/ports/audit-engine.ports';
import {
  AuditAccess,
  AuditHead,
  AuditObject,
  AuditObjectKind,
  AuditQuery,
  AuditRecordView,
  AuditScope,
  auditFailure,
  auditScope,
} from '../../../domain/audit-contracts';
import {
  AuditRecordModel,
  AuditHeadModel,
  AuditScopeCatalogModel,
  auditObjectModels,
} from '../models/audit-engine.models';
let sqliteTail = Promise.resolve();
async function sqliteSerial<T>(operation: () => Promise<T>): Promise<T> {
  let release = () => {};
  const before = sqliteTail;
  sqliteTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await before;
  try {
    return await operation();
  } finally {
    release();
  }
}
function recordView(model: AuditRecordModel): AuditRecordView {
  const row = model.get({ plain: true });
  return {
    ...row,
    sequence: Number(row.sequence),
    occurredAt: new Date(row.occurredAt).toISOString(),
    receivedAt: new Date(row.receivedAt).toISOString(),
  };
}
function objectView(model: InstanceType<(typeof auditObjectModels)['POLICY']>): AuditObject {
  const row = model.get({ plain: true });
  return {
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}
export class SequelizeAuditEngineRepository implements AuditRepositoryPort {
  async statistics(
    scope: AuditScope,
    context: RecordStoreContext,
  ): Promise<{ records: number; payloadBytes: number }> {
    const dialect = sequelize.getDialect();
    const queryGenerator = (sequelize.getQueryInterface() as any).queryGenerator;
    const quote = (identifier: string) => queryGenerator.quoteIdentifier(identifier);
    const size =
      dialect === 'postgres'
        ? `pg_column_size(${quote('payload')})`
        : dialect === 'mysql'
          ? `OCTET_LENGTH(${quote('payload')})`
          : `length(CAST(${quote('payload')} AS BLOB))`;
    const company =
      scope.companyId === null ? `${quote('companyId')} IS NULL` : `${quote('companyId')}=:companyId`;
    const rows = await sequelize.query<{ records: string | number; payloadBytes: string | number }>(
      `SELECT COUNT(*) AS records,COALESCE(SUM(${size}),0) AS ${quote('payloadBytes')} FROM ${quote('audit_records')} WHERE ${quote('scopeKey')}=:scopeKey AND ${company}`,
      {
        replacements: { scopeKey: scope.scopeKey, companyId: scope.companyId },
        transaction: resolveRecordTransaction(context),
        type: QueryTypes.SELECT,
      },
    );
    return {
      records: Number(rows[0]?.records || 0),
      payloadBytes: Number(rows[0]?.payloadBytes || 0),
    };
  }
  async transaction<T>(
    scope: AuditScope,
    operation: (context: RecordStoreContext) => Promise<T>,
    context?: RecordStoreContext,
  ): Promise<T> {
    if (context) {
      if (recordTransactionTenant(context) !== scope.companyId)
        throw auditFailure('Audit transaction tenant mismatch.', 403);
      await this.lock(scope, resolveRecordTransaction(context)!);
      return operation(context);
    }
    const run = () =>
      sequelize.transaction(async (transaction) => {
        await this.lock(scope, transaction);
        return withRecordTransaction(transaction, scope.companyId, operation);
      });
    return sequelize.getDialect() === 'sqlite' ? sqliteSerial(run) : run();
  }
  private async lock(scope: AuditScope, transaction: Transaction) {
    if (sequelize.getDialect() === 'postgres') {
      await sequelize.query("SELECT set_config('app.current_tenant',:tenant,true)", {
        replacements: { tenant: scope.companyId === null ? '' : String(scope.companyId) },
        type: QueryTypes.SELECT,
        transaction,
      });
      await sequelize.query("SELECT pg_advisory_xact_lock(hashtext('audit'),:tenant)", {
        replacements: { tenant: scope.companyId || 0 },
        transaction,
      });
    }
  }
  async head(scope: AuditScope, context: RecordStoreContext): Promise<AuditHead> {
    const transaction = resolveRecordTransaction(context);
    await AuditScopeCatalogModel.findOrCreate({
      where: { scopeKey: scope.scopeKey },
      defaults: auditScope(scope.companyId),
      transaction,
    });
    await AuditHeadModel.findOrCreate({
      where: { scopeKey: scope.scopeKey },
      defaults: { ...auditScope(scope.companyId), sequence: 0, recordHash: '0'.repeat(64) },
      transaction,
    });
    const row = await AuditHeadModel.findOne({
      where: { ...auditScope(scope.companyId) },
      transaction,
      lock: transaction?.LOCK.UPDATE,
    });
    if (!row) throw new Error('Audit head unavailable.');
    const data = row.get({ plain: true });
    return { ...data, sequence: Number(data.sequence) };
  }
  async byEvent(scope: AuditScope, sourceId: string, eventId: string, context: RecordStoreContext) {
    const row = await AuditRecordModel.findOne({
      where: { ...auditScope(scope.companyId), sourceId, eventId },
      transaction: resolveRecordTransaction(context),
    });
    return row ? recordView(row) : null;
  }
  async insert(record: AuditRecordView, context: RecordStoreContext) {
    await AuditRecordModel.create(record, { transaction: resolveRecordTransaction(context) });
  }
  async advance(head: AuditHead, context: RecordStoreContext) {
    const [changed] = await AuditHeadModel.update(
      { sequence: head.sequence, recordHash: head.recordHash },
      {
        where: { scopeKey: head.scopeKey, companyId: head.companyId, sequence: head.sequence - 1 },
        transaction: resolveRecordTransaction(context),
      },
    );
    if (changed !== 1) throw auditFailure('Audit head changed concurrently.', 409);
  }
  async records(
    scope: AuditScope,
    query: AuditQuery,
    context: RecordStoreContext,
    access?: Pick<AuditAccess, 'actorId' | 'sensitive' | 'ownOnly'>,
  ) {
    const where: Record<string | symbol, unknown> = { ...auditScope(scope.companyId) };
    for (const field of [
      'eventType',
      'module',
      'action',
      'category',
      'severity',
      'outcome',
      'actorId',
      'resourceType',
      'resourceId',
      'correlationId',
    ] as const)
      if (query[field]) where[field] = query[field];
    if (query.cursor !== undefined || query.throughSequence !== undefined)
      where.sequence = {
        ...(query.cursor !== undefined ? { [Op.gt]: query.cursor } : {}),
        ...(query.throughSequence !== undefined ? { [Op.lte]: query.throughSequence } : {}),
      };
    if (query.from || query.to)
      where.occurredAt = {
        ...(query.from ? { [Op.gte]: new Date(query.from) } : {}),
        ...(query.to ? { [Op.lte]: new Date(query.to) } : {}),
      };
    if (access?.ownOnly) {
      where.actorId = String(access.actorId);
      where[Op.and] = [
        {
          [Op.or]: [
            { resourceType: { [Op.in]: ['USER', 'user'] }, resourceId: String(access.actorId) },
            { resourceType: { [Op.in]: ['AUTH_SESSION', 'session'] } },
            {
              resourceType: 'HTTP',
              sourceId: 'http',
              category: { [Op.in]: ['ACCESS', 'SECURITY'] },
            },
          ],
        },
      ];
    }
    if (access && !access.sensitive) where.sensitivity = 'STANDARD';
    return (
      await AuditRecordModel.findAll({
        where: where as WhereOptions,
        order: [['sequence', 'ASC']],
        limit: Math.min(query.limit || 100, 1000),
        transaction: resolveRecordTransaction(context),
      })
    ).map(recordView);
  }
  async record(scope: AuditScope, id: string, context: RecordStoreContext) {
    const row = await AuditRecordModel.findOne({
      where: { ...auditScope(scope.companyId), id },
      transaction: resolveRecordTransaction(context),
    });
    return row ? recordView(row) : null;
  }
  async createObject(object: AuditObject, context: RecordStoreContext) {
    return objectView(
      await auditObjectModels[object.kind].create(object, {
        transaction: resolveRecordTransaction(context),
      }),
    );
  }
  async object(scope: AuditScope, kind: AuditObjectKind, id: string, context: RecordStoreContext) {
    const transaction = resolveRecordTransaction(context),
      row = await auditObjectModels[kind].findOne({
        where: { ...auditScope(scope.companyId), id, kind },
        transaction,
        lock: transaction?.LOCK.UPDATE,
      });
    return row ? objectView(row) : null;
  }
  async objects(
    scope: AuditScope,
    kind: AuditObjectKind,
    context: RecordStoreContext,
    filter?: AuditObjectFilter,
  ) {
    const where: Record<string | symbol, unknown> = { ...auditScope(scope.companyId), kind };
    if (filter?.status) where.status = { [Op.in]: filter.status };
    if (filter?.key) where.key = filter.key;
    if (filter?.unnotified) where['data.notifiedAt'] = { [Op.is]: null };
    if (filter?.beforeUpdatedAt) where.updatedAt = { [Op.lt]: new Date(filter.beforeUpdatedAt) };
    return (
      await auditObjectModels[kind].findAll({
        where: where as WhereOptions,
        ...(filter?.limit ? { limit: Math.min(1000, Math.max(1, filter.limit)) } : {}),
        order: [
          ['createdAt', 'ASC'],
          ['id', 'ASC'],
        ],
        transaction: resolveRecordTransaction(context),
      })
    ).map(objectView);
  }
  async updateObject(
    object: AuditObject,
    changes: { status?: string; data?: Record<string, unknown> },
    context: RecordStoreContext,
  ) {
    const row = await auditObjectModels[object.kind].findOne({
      where: { id: object.id, scopeKey: object.scopeKey, companyId: object.companyId },
      transaction: resolveRecordTransaction(context),
    });
    if (!row) throw auditFailure('Audit workflow not found.', 404);
    return objectView(
      await row.update(
        { ...changes, updatedAt: new Date().toISOString() },
        { transaction: resolveRecordTransaction(context) },
      ),
    );
  }
  async scopes() {
    return (await AuditScopeCatalogModel.findAll({ attributes: ['companyId'] })).map((row) =>
      auditScope(row.getDataValue('companyId')),
    );
  }
}
