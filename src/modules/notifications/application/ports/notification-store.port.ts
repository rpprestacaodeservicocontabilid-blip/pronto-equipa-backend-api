import {
  RecordStoreContext,
  RecordQuery,
  StoredRecord,
} from '../../../../shared/application/ports/record-store.port';
export {
  RecordFilter,
  RecordStoreContext,
  RecordQuery,
} from '../../../../shared/application/ports/record-store.port';
import { NotificationDataMap, NotificationKind } from '../dto/notification-data';
export interface NotificationRecord<K extends NotificationKind = NotificationKind> extends Omit<
  StoredRecord,
  'kind' | 'data'
> {
  kind: K;
  data: NotificationDataMap[K];
  scopeKey: string;
  userId: number | null;
}
export type NotificationQuery<K extends NotificationKind> = Omit<RecordQuery, 'where'> & {
  where: Record<string, unknown> & { kind: K };
};
export interface NotificationStorePort {
  transaction<T>(
    companyId: number | null,
    operation: (context: RecordStoreContext) => Promise<T>,
  ): Promise<T>;
  findOne<K extends NotificationKind>(
    query: NotificationQuery<K>,
  ): Promise<NotificationRecord<K> | null>;
  findAll<K extends NotificationKind>(
    query: NotificationQuery<K>,
  ): Promise<NotificationRecord<K>[]>;
  create<K extends NotificationKind>(
    input: Omit<NotificationRecord<K>, 'createdAt' | 'updatedAt'>,
    options?: { transaction?: RecordStoreContext },
  ): Promise<NotificationRecord<K>>;
  update<K extends NotificationKind>(
    record: NotificationRecord<K>,
    changes: Partial<NotificationRecord<K>>,
    options?: { transaction?: RecordStoreContext },
  ): Promise<NotificationRecord<K>>;
  count(query: RecordQuery): Promise<number | Array<{ count: number; status?: string }>>;
  destroy(query: RecordQuery): Promise<number>;
}
