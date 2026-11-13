import { DataTypes, Model, ModelStatic } from 'sequelize';
import { sequelize } from '../../../infra/database';

export interface PayslipsRecord {
  id: string;
  companyId: number;
  status: string;
  runId: string | null;
  employeeId: string | null;
  key: string;
  data: Record<string, unknown>;
}

export class PayslipsRecordModel extends Model<PayslipsRecord> {
  declare id: string;
  declare companyId: number;
  declare status: string;
  declare runId: string | null;
  declare employeeId: string | null;
  declare key: string;
  declare data: Record<string, unknown>;
}

const define = (tableName: string, indexes: Array<{ fields: string[]; unique?: boolean }> = []): ModelStatic<PayslipsRecordModel> => {
  class RecordModel extends PayslipsRecordModel {}
  RecordModel.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true },
      companyId: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING(40), allowNull: false },
      runId: { type: DataTypes.UUID, allowNull: true },
      employeeId: { type: DataTypes.UUID, allowNull: true },
      key: { type: DataTypes.STRING(200), allowNull: false },
      data: { type: DataTypes.JSON, allowNull: false },
    },
    {
      sequelize,
      tableName,
      modelName: tableName,
      indexes: [{ fields: ['companyId', 'runId', 'status'] }, ...indexes],
    },
  );
  return RecordModel;
};

export const PayslipModel = define('payslips', [
  { fields: ['companyId', 'key'], unique: true },
  { fields: ['companyId', 'employeeId', 'status'] },
]);
export const PayslipBatchModel = define('payslip_batches', [{ fields: ['companyId', 'key'], unique: true }]);
export const PayslipBatchItemModel = define('payslip_batch_items', [{ fields: ['companyId', 'key'], unique: true }]);
export const PayslipTemplateModel = define('payslip_templates', [{ fields: ['companyId', 'key'], unique: true }]);
export const PayslipTemplateVersionModel = define('payslip_template_versions', [{ fields: ['companyId', 'key'], unique: true }]);
export const PayslipDocumentModel = define('payslip_documents', [{ fields: ['companyId', 'key'], unique: true }]);
export const PayslipPublicationModel = define('payslip_publications');
export const PayslipDeliveryModel = define('payslip_deliveries');
export const PayslipCorrectionModel = define('payslip_corrections', [{ fields: ['companyId', 'key'], unique: true }]);
export const PayslipAccessLogModel = define('payslip_access_logs');
export const PayslipPolicyModel = define('payslip_policies', [{ fields: ['companyId', 'key'], unique: true }]);
export const PayslipOutboxModel = define('payslip_outbox');
export const EmployeeUserLinkModel = define('employee_user_links', [
  { fields: ['companyId', 'key'], unique: true },
  { fields: ['companyId', 'employeeId'], unique: true },
]);

export const PAYSLIPS_MODELS = [
  PayslipModel, PayslipBatchModel, PayslipBatchItemModel, PayslipTemplateModel,
  PayslipTemplateVersionModel, PayslipDocumentModel, PayslipPublicationModel,
  PayslipDeliveryModel, PayslipCorrectionModel, PayslipAccessLogModel,
  PayslipPolicyModel, PayslipOutboxModel, EmployeeUserLinkModel,
];
