/** Portable persistence specifications used by document-oriented aggregates. */
export const RecordFilter = {
  in: '$in',
  like: '$like',
  lt: '$lt',
  notIn: '$notIn',
  ne: '$ne',
  lte: '$lte',
  gte: '$gte',
} as const;
export interface StoredRecord {
  id: string;
  companyId: number | null;
  kind: string;
  key: string;
  status: string;
  data: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}
export interface RecordStoreContext {
  readonly identity: symbol;
}
export interface RecordQuery {
  where?: Record<string, unknown>;
  transaction?: RecordStoreContext;
  order?: Array<[string, 'ASC' | 'DESC']>;
  limit?: number;
  offset?: number;
  forUpdate?: boolean;
  skipLocked?: boolean;
  group?: string[];
}
export interface RecordStorePort<R extends { id: string }> {
  transaction<T>(
    companyId: number | null,
    operation: (context: RecordStoreContext) => Promise<T>,
  ): Promise<T>;
  findOne(query: RecordQuery): Promise<R | null>;
  findAll(query: RecordQuery): Promise<R[]>;
  create(
    input: Omit<R, 'createdAt' | 'updatedAt'> & { createdAt?: Date; updatedAt?: Date },
    options?: { transaction?: RecordStoreContext },
  ): Promise<R>;
  update(
    record: R,
    changes: Partial<R>,
    options?: { transaction?: RecordStoreContext },
  ): Promise<R>;
  count(query: RecordQuery): Promise<number | Array<{ count: number; status?: string }>>;
  updateWhere(changes: Partial<R>, query: RecordQuery): Promise<number>;
  destroy(query: RecordQuery): Promise<number>;
}
