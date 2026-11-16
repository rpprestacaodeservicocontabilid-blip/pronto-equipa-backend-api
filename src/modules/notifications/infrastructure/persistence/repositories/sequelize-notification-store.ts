import { SequelizeRecordStore } from '../../../../../shared/infrastructure/persistence/sequelize-record-store';
import {
  NotificationRecord,
  NotificationStorePort,
  NotificationQuery,
} from '../../../application/ports/notification-store.port';
import {
  NotificationKind,
  parseNotificationData,
} from '../../../application/dto/notification-data';
import {
  StoredRecord,
  RecordQuery,
  RecordStoreContext,
} from '../../../../../shared/application/ports/record-store.port';
import { NotificationRow } from '../models/notification.model';
type PersistedNotification = Omit<StoredRecord, 'data'> & {
  data: Record<string, unknown>;
  scopeKey: string;
  userId: number | null;
};
export class SequelizeNotificationStore implements NotificationStorePort {
  private readonly store = new SequelizeRecordStore<PersistedNotification>(
    NotificationRow,
    'notifications',
  );
  private view<K extends NotificationKind>(
    row: PersistedNotification,
    kind: K,
  ): NotificationRecord<K> {
    if (row.kind !== kind) throw new Error('Unexpected notification record kind.');
    return { ...row, kind, data: parseNotificationData(kind, row.data) };
  }
  transaction<T>(companyId: number | null, operation: (context: RecordStoreContext) => Promise<T>) {
    return this.store.transaction(companyId, operation);
  }
  async findOne<K extends NotificationKind>(query: NotificationQuery<K>) {
    const row = await this.store.findOne(query);
    return row ? this.view(row, query.where.kind) : null;
  }
  async findAll<K extends NotificationKind>(query: NotificationQuery<K>) {
    return (await this.store.findAll(query)).map((row) => this.view(row, query.where.kind));
  }
  async create<K extends NotificationKind>(
    input: Omit<NotificationRecord<K>, 'createdAt' | 'updatedAt'>,
    options?: { transaction?: RecordStoreContext },
  ) {
    const data = parseNotificationData(input.kind, input.data);
    return this.view(await this.store.create({ ...input, data }, options), input.kind);
  }
  async update<K extends NotificationKind>(
    record: NotificationRecord<K>,
    changes: Partial<NotificationRecord<K>>,
    options?: { transaction?: RecordStoreContext },
  ) {
    if (changes.kind && changes.kind !== record.kind)
      throw new Error('Cannot change notification record kind.');
    const checked = {
      ...changes,
      ...(changes.data ? { data: parseNotificationData(record.kind, changes.data) } : {}),
    };
    const updated = await this.store.update(record, checked, options);
    Object.assign(record, this.view(updated, record.kind));
    return record;
  }
  count(query: RecordQuery) {
    return this.store.count(query);
  }
  destroy(query: RecordQuery) {
    return this.store.destroy(query);
  }
}
