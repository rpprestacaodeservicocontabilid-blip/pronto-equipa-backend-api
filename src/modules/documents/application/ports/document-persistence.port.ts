import {
  RecordStoreContext,
  RecordStorePort,
} from '../../../../shared/application/ports/record-store.port';

export interface DocumentRecord {
  id: string;
  companyId: number;
  status: string;
  runId: string | null;
  employeeId: string | null;
  key: string;
  version: number;
  data: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}
export type DocumentCollection =
  | 'document'
  | 'documentVersion'
  | 'documentUploadSession'
  | 'documentAssociation'
  | 'documentValidation'
  | 'documentAccessLog'
  | 'documentLegalHold'
  | 'documentDeletionRequest'
  | 'documentCategory'
  | 'documentPolicy'
  | 'documentStorageUsage'
  | 'documentBatch'
  | 'documentBatchItem'
  | 'documentExpiryAlert';
export interface DocumentPersistencePort {
  collections: Record<DocumentCollection, RecordStorePort<DocumentRecord>>;
  update(
    record: DocumentRecord,
    changes: Partial<DocumentRecord>,
    options?: { transaction?: RecordStoreContext },
  ): Promise<DocumentRecord>;
}
