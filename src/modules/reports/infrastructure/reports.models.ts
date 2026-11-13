import { DataTypes, Model, ModelStatic } from 'sequelize';
import { sequelize } from '../../../infra/database';

/** Tenant scoped execution, export, custom-report and schedule metadata. */
export class ReportsRecordModel extends Model {
  declare id: string;
  declare companyId: number;
  declare recordType: string;
  declare status: string;
  declare ownerUserId: number | null;
  declare code: string | null;
  declare payload: Record<string, unknown>;
  declare createdAt: Date;
  declare updatedAt: Date;
}
ReportsRecordModel.init({
  id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
  companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  recordType: { type: DataTypes.STRING(40), allowNull: false },
  status: { type: DataTypes.STRING(30), allowNull: false },
  ownerUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  code: { type: DataTypes.STRING(40), allowNull: true },
  payload: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false },
}, { sequelize, tableName: 'report_records', indexes: [
  { fields: ['companyId', 'recordType', 'createdAt'], name: 'idx_report_records_tenant_type_date' },
  { fields: ['companyId', 'ownerUserId', 'recordType'], name: 'idx_report_records_owner' },
  { fields: ['companyId', 'code', 'recordType'], name: 'idx_report_records_code' },
] });
export const REPORTS_MODELS: ModelStatic<Model>[] = [ReportsRecordModel];
