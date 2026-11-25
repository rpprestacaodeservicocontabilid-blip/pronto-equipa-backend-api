import { Model, ModelStatic } from 'sequelize';
import {
  PayrollPaymentInstructionModel,
  PayrollPaymentBatchModel,
  PayrollPaymentBatchItemModel,
  PayrollPaymentOrderModel,
  PayrollPaymentAttemptModel,
  PayrollPaymentTransactionModel,
  PayrollPaymentApprovalModel,
  PayrollPaymentBankAccountModel,
  PayrollPaymentProviderConfigModel,
  PayrollPaymentStatementImportModel,
  PayrollPaymentStatementEntryModel,
  PayrollPaymentReconciliationModel,
  PayrollPaymentReturnModel,
  PayrollPaymentOutboxModel,
  PayrollPaymentInboxModel,
  PayrollPaymentPolicyModel,
} from '../models/payment.models';
import {
  PaymentInstructionRecord,
  PaymentBatchRecord,
  PaymentBatchItemRecord,
  PaymentOrderRecord,
  PaymentAttemptRecord,
  PaymentTransactionRecord,
  PaymentApprovalRecord,
  PaymentBankAccountRecord,
  PaymentProviderConfigRecord,
  PaymentStatementImportRecord,
  PaymentStatementEntryRecord,
  PaymentReconciliationRecord,
  PaymentReturnRecord,
  PaymentOutboxRecord,
  PaymentInboxRecord,
  PaymentPolicyRecord,
  PaymentRecord,
  PaymentPersistencePort,
  PaymentRecordStorePort,
} from '../../../application/ports/payment-persistence.port';
import {
  RecordStoreContext,
  RecordQuery,
} from '../../../../../shared/application/ports/record-store.port';
import {
  SequelizeRecordStore,
  resolveRecordTransaction,
} from '../../../../../shared/infrastructure/persistence/sequelize-record-store';
class PaymentStore<T extends PaymentRecord>
  extends SequelizeRecordStore<T>
  implements PaymentRecordStorePort<T>
{
  constructor(
    model: ModelStatic<Model>,
    private readonly remember: (record: T, row: Model) => void,
  ) {
    super(model, 'payments');
  }
  protected view(row: Model): T {
    const record = super.view(row);
    this.remember(record, row);
    return record;
  }
  create(
    input: Omit<T, 'createdAt' | 'updatedAt'> & { createdAt?: Date; updatedAt?: Date },
    options?: { transaction?: RecordStoreContext },
  ): Promise<T>;
  create(
    input: Partial<T> & PaymentRecord,
    options?: { transaction?: RecordStoreContext },
  ): Promise<T>;
  async create(
    input:
      | (Partial<T> & PaymentRecord)
      | (Omit<T, 'createdAt' | 'updatedAt'> & { createdAt?: Date; updatedAt?: Date }),
    options?: { transaction?: RecordStoreContext },
  ) {
    return super.create(input as Omit<T, 'createdAt' | 'updatedAt'>, options);
  }
  async count(query: RecordQuery) {
    return Number(await super.count(query));
  }
  async findAndCountAll(query: RecordQuery) {
    const result = await this.model.findAndCountAll(this.options(query));
    return { rows: result.rows.map((row) => this.view(row)), count: result.count };
  }
  async findOrCreate(
    query: RecordQuery & { defaults: Partial<T> & PaymentRecord },
  ): Promise<[T, boolean]> {
    const [row, created] = await this.model.findOrCreate({
      ...this.options(query),
      defaults: query.defaults as Record<string, unknown>,
    });
    return [this.view(row), created];
  }
  async upsert(input: Partial<T> & PaymentRecord) {
    await this.model.upsert(input as Record<string, unknown>);
  }
  async bulkCreate(input: Array<Partial<T> & PaymentRecord>, options?: { transaction?: RecordStoreContext }) {
    return (await this.model.bulkCreate(input as Array<Record<string, unknown>>, {
      transaction: resolveRecordTransaction(options?.transaction),
    })).map((row) =>
      this.view(row),
    );
  }
}
export class SequelizePaymentPersistence implements PaymentPersistencePort {
  private readonly records = new WeakMap<PaymentRecord, Model>();
  private remember = (record: PaymentRecord, row: Model) => {
    this.records.set(record, row);
  };
  readonly instruction = new PaymentStore<PaymentInstructionRecord>(
    PayrollPaymentInstructionModel,
    this.remember,
  );
  readonly batch = new PaymentStore<PaymentBatchRecord>(PayrollPaymentBatchModel, this.remember);
  readonly batchItem = new PaymentStore<PaymentBatchItemRecord>(
    PayrollPaymentBatchItemModel,
    this.remember,
  );
  readonly order = new PaymentStore<PaymentOrderRecord>(PayrollPaymentOrderModel, this.remember);
  readonly attempt = new PaymentStore<PaymentAttemptRecord>(
    PayrollPaymentAttemptModel,
    this.remember,
  );
  readonly transaction = new PaymentStore<PaymentTransactionRecord>(
    PayrollPaymentTransactionModel,
    this.remember,
  );
  readonly approval = new PaymentStore<PaymentApprovalRecord>(
    PayrollPaymentApprovalModel,
    this.remember,
  );
  readonly bankAccount = new PaymentStore<PaymentBankAccountRecord>(
    PayrollPaymentBankAccountModel,
    this.remember,
  );
  readonly providerConfig = new PaymentStore<PaymentProviderConfigRecord>(
    PayrollPaymentProviderConfigModel,
    this.remember,
  );
  readonly statementImport = new PaymentStore<PaymentStatementImportRecord>(
    PayrollPaymentStatementImportModel,
    this.remember,
  );
  readonly statementEntry = new PaymentStore<PaymentStatementEntryRecord>(
    PayrollPaymentStatementEntryModel,
    this.remember,
  );
  readonly reconciliation = new PaymentStore<PaymentReconciliationRecord>(
    PayrollPaymentReconciliationModel,
    this.remember,
  );
  readonly return = new PaymentStore<PaymentReturnRecord>(PayrollPaymentReturnModel, this.remember);
  readonly outbox = new PaymentStore<PaymentOutboxRecord>(PayrollPaymentOutboxModel, this.remember);
  readonly inbox = new PaymentStore<PaymentInboxRecord>(PayrollPaymentInboxModel, this.remember);
  readonly policy = new PaymentStore<PaymentPolicyRecord>(PayrollPaymentPolicyModel, this.remember);
  withCompany<T>(companyId: number, operation: (context: RecordStoreContext) => Promise<T>) {
    return this.instruction.transaction(companyId, operation);
  }
  async update<T extends PaymentRecord>(
    record: T,
    changes: Partial<T>,
    options?: { transaction?: RecordStoreContext },
  ) {
    const row = this.records.get(record);
    if (!row) throw new Error('Payment record was not loaded by this repository.');
    await row.update(changes, { transaction: resolveRecordTransaction(options?.transaction) });
    Object.assign(record, row.toJSON());
    return record;
  }
}
