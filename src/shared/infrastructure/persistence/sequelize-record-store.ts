import { PersistenceConflictError } from '../../application/ports/persistence-conflict.error';
import {
  Model,
  ModelStatic,
  Op,
  QueryTypes,
  Transaction,
  WhereOptions,
  UniqueConstraintError,
} from 'sequelize';
import { sequelize } from '../../../infra/database';
import {
  RecordStorePort,
  RecordQuery,
  RecordStoreContext,
} from '../../application/ports/record-store.port';
const contexts = new WeakMap<RecordStoreContext, Transaction>();
const contextTenants = new WeakMap<RecordStoreContext, number|null>();
export function recordTransactionTenant(context:RecordStoreContext):number|null {
  resolveRecordTransaction(context);
  return contextTenants.get(context)??null;
}
export async function withRecordTransaction<T>(transaction:Transaction,companyId:number|null,operation:(context:RecordStoreContext)=>Promise<T>):Promise<T>{
  const context={identity:Symbol('unit-of-work')};contexts.set(context,transaction);contextTenants.set(context,companyId);
  try{return await operation(context);}finally{contexts.delete(context);contextTenants.delete(context);}
}
export function resolveRecordTransaction(context?: RecordStoreContext) {
  if (!context) return undefined;
  const transaction = contexts.get(context);
  if (!transaction) throw new Error('Inactive unit of work.');
  return transaction;
}
export class SequelizeRecordStore<R extends { id: string }> implements RecordStorePort<R> {
  constructor(
    protected readonly model: ModelStatic<Model>,
    private readonly namespace: string,
  ) {}
  async transaction<T>(
    companyId: number | null,
    operation: (context: RecordStoreContext) => Promise<T>,
  ): Promise<T> {
    return sequelize.transaction(async (transaction) => {
      if (sequelize.getDialect() === 'postgres') {
        await sequelize.query("SELECT set_config('app.current_tenant',:tenant,true)", {
          replacements: { tenant: companyId === null ? '' : String(companyId) },
          type: QueryTypes.SELECT,
          transaction,
        });
        await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:namespace),:scope)', {
          replacements: { namespace: this.namespace, scope: companyId || 0 },
          transaction,
        });
      }
      return withRecordTransaction(transaction,companyId,operation);
    });
  }
  private transactionFor(context?: RecordStoreContext) {
    return resolveRecordTransaction(context);
  }

  private filter(value: unknown): unknown {
    if (value instanceof Date || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => this.filter(item));
    const operators: Record<string, symbol> = {
      $in: Op.in,
      $like: Op.like,
      $lt: Op.lt,
      $notIn: Op.notIn,
      $ne: Op.ne,
      $lte: Op.lte,
      $gte: Op.gte,
    };
    const result: Record<string | symbol, unknown> = {};
    for (const [key, item] of Object.entries(value))
      result[operators[key] || key] = this.filter(item);
    return result;
  }
  protected options(query: RecordQuery) {
    const transaction = this.transactionFor(query.transaction);
    return {
      where: this.filter(query.where) as WhereOptions,
      transaction,
      order: query.order,
      limit: query.limit,
      offset: query.offset,
      ...(query.forUpdate ? { lock: transaction?.LOCK.UPDATE } : {}),
      skipLocked: query.skipLocked,
    };
  }
  protected view(row: Model): R {
    return row.toJSON();
  }
  async findOne(query: RecordQuery) {
    const row = await this.model.findOne(this.options(query));
    return row ? this.view(row) : null;
  }
  async findAll(query: RecordQuery) {
    return (await this.model.findAll(this.options(query))).map((row) => this.view(row));
  }
  async create(
    input: Omit<R, 'createdAt' | 'updatedAt'> & { createdAt?: Date; updatedAt?: Date },
    options: { transaction?: RecordStoreContext } = {},
  ) {
    try {
      return this.view(
        await this.model.create(input, { transaction: this.transactionFor(options.transaction) }),
      );
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw new PersistenceConflictError();
      throw error;
    }
  }
  async update(record: R, changes: Partial<R>, options: { transaction?: RecordStoreContext } = {}) {
    const transaction = this.transactionFor(options.transaction),
      row = await this.model.findOne({
        where: { id: record.id, ...('companyId' in record ? { companyId: record.companyId } : {}) },
        transaction,
        lock: transaction?.LOCK.UPDATE,
      });
    if (!row) throw new Error('Record no longer exists.');
    await row.update(changes, { transaction });
    Object.assign(record, this.view(row));
    return record;
  }
  async count(query: RecordQuery) {
    if (query.group)
      return (await this.model.count({ ...this.options(query), group: query.group })) as Array<{
        count: number;
        status?: string;
      }>;
    return this.model.count(this.options(query));
  }
  async updateWhere(changes: Partial<R>, query: RecordQuery) {
    const [count] = await this.model.update(changes, this.options(query));
    return count;
  }
  destroy(query: RecordQuery) {
    return this.model.destroy(this.options(query));
  }
}
