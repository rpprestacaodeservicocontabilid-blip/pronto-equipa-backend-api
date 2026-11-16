import { DataTypes, Model, ModelStatic } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';
export class DocumentsRecordModel extends Model {
  declare id: string;
  declare companyId: number;
  declare status: string;
  declare runId: string | null;
  declare employeeId: string | null;
  declare key: string;
  declare version: number;
  declare data: Record<string, any>;
  declare createdAt: Date;
  declare updatedAt: Date;
}
const define = (tableName: string, uniqueKey = true): ModelStatic<DocumentsRecordModel> => {
  class RecordModel extends DocumentsRecordModel {}
  RecordModel.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      status: { type: DataTypes.STRING(40), allowNull: false },
      runId: { type: DataTypes.UUID, allowNull: true },
      employeeId: { type: DataTypes.UUID, allowNull: true },
      key: { type: DataTypes.STRING(220), allowNull: false },
      version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      data: { type: DataTypes.JSON, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName,
      modelName: tableName,
      indexes: [
        ...(uniqueKey ? [{ unique: true, fields: ['companyId', 'key'] }] : []),
        { fields: ['companyId', 'runId', 'status'] },
        { fields: ['companyId', 'employeeId', 'status'] },
      ],
    },
  );
  return RecordModel;
};
export const DocumentModel = define('documents');
export const DocumentVersionModel = define('document_versions');
export const DocumentFileModel = define('document_files');
export const DocumentUploadSessionModel = define('document_upload_sessions');
export const DocumentUploadPartModel = define('document_upload_parts', false);
export const DocumentBatchModel = define('document_batches');
export const DocumentBatchItemModel = define('document_batch_items');
export const DocumentCategoryModel = define('document_categories');
export const DocumentTypeModel = define('document_types');
export const DocumentAssociationModel = define('document_associations');
export const DocumentValidationModel = define('document_validations', false);
export const DocumentApprovalModel = define('document_approvals', false);
export const DocumentAccessGrantModel = define('document_access_grants');
export const DocumentAccessLogModel = define('document_access_logs', false);
export const DocumentExpiryAlertModel = define('document_expiry_alerts');
export const DocumentRetentionPolicyModel = define('document_retention_policies');
export const DocumentLegalHoldModel = define('document_legal_holds', false);
export const DocumentDeletionRequestModel = define('document_deletion_requests');
export const DocumentProcessingJobModel = define('document_processing_jobs', false);
export const DocumentStorageUsageModel = define('document_storage_usage');
export const DocumentPolicyModel = define('document_policies');
export const DocumentOutboxModel = define('document_outbox', false);
