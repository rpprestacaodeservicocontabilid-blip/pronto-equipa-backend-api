import { Model, ModelStatic } from 'sequelize';
import { RecordStorePort, RecordStoreContext } from '../../application/ports/record-store.port';
import { SequelizeRecordStore } from './sequelize-record-store';

/** Tracks persistence identity without exposing ORM instances to application code. */
export class SequelizeRecordCollections<R extends { id: string }, K extends string> {
  private readonly owners = new WeakMap<R, RecordStorePort<R>>();
  readonly collections: Record<K, RecordStorePort<R>>;

  constructor(models: Record<K, ModelStatic<Model>>, namespace: string) {
    this.collections = Object.fromEntries(
      Object.entries(models).map(([name, model]) => {
        const store = new SequelizeRecordStore<R>(model as ModelStatic<Model>, namespace);
        const remember = (row: R) => {
          this.owners.set(row, store);
          return row;
        };
        const repository: RecordStorePort<R> = {
          transaction: store.transaction.bind(store),
          findOne: async (query) => {
            const row = await store.findOne(query);
            return row ? remember(row) : null;
          },
          findAll: async (query) => (await store.findAll(query)).map(remember),
          create: async (input, options) => remember(await store.create(input, options)),
          updateWhere: store.updateWhere.bind(store),
          update: store.update.bind(store),
          count: store.count.bind(store),
          destroy: store.destroy.bind(store),
        };
        return [name, repository];
      }),
    ) as Record<K, RecordStorePort<R>>;
  }

  update(record: R, changes: Partial<R>, options?: { transaction?: RecordStoreContext }) {
    const owner = this.owners.get(record);
    if (!owner) throw new Error('Record was not loaded by this repository.');
    return owner.update(record, changes, options);
  }
}
