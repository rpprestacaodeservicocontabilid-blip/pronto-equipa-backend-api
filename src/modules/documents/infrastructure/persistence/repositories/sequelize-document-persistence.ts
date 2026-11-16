import {
  DocumentPersistencePort,
  DocumentRecord,
  DocumentCollection,
} from '../../../application/ports/document-persistence.port';
import {
  DocumentModel,
  DocumentVersionModel,
  DocumentUploadSessionModel,
  DocumentAssociationModel,
  DocumentValidationModel,
  DocumentAccessLogModel,
  DocumentLegalHoldModel,
  DocumentDeletionRequestModel,
  DocumentCategoryModel,
  DocumentPolicyModel,
  DocumentStorageUsageModel,
  DocumentBatchModel,
  DocumentBatchItemModel,
  DocumentExpiryAlertModel,
} from '../models/documents.models';

import { SequelizeRecordCollections } from '../../../../../shared/infrastructure/persistence/sequelize-record-collections';
export class SequelizeDocumentPersistence
  extends SequelizeRecordCollections<DocumentRecord, DocumentCollection>
  implements DocumentPersistencePort
{
  constructor() {
    super(
      {
        document: DocumentModel,
        documentVersion: DocumentVersionModel,
        documentUploadSession: DocumentUploadSessionModel,
        documentAssociation: DocumentAssociationModel,
        documentValidation: DocumentValidationModel,
        documentAccessLog: DocumentAccessLogModel,
        documentLegalHold: DocumentLegalHoldModel,
        documentDeletionRequest: DocumentDeletionRequestModel,
        documentCategory: DocumentCategoryModel,
        documentPolicy: DocumentPolicyModel,
        documentStorageUsage: DocumentStorageUsageModel,
        documentBatch: DocumentBatchModel,
        documentBatchItem: DocumentBatchItemModel,
        documentExpiryAlert: DocumentExpiryAlertModel,
      },
      'documents',
    );
  }
}
