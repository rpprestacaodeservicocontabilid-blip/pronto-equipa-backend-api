import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

export const platformKinds = ['EXECUTION', 'EXPORT', 'TEMPLATE', 'SCHEDULE', 'POLICY'] as const;
export type PlatformReportKind = typeof platformKinds[number];

export class PlatformReportRecord extends Model {
  declare id: string;
  declare kind: PlatformReportKind;
  declare ownerId: number;
  declare key: string;
  declare status: string;
  declare dueAt: Date | null;
  declare data: Record<string, unknown>;
  declare createdAt: Date;
  declare updatedAt: Date;
}

PlatformReportRecord.init({
  id: { type: DataTypes.UUID, primaryKey: true },
  kind: { type: DataTypes.STRING(20), allowNull: false },
  ownerId: { type: DataTypes.INTEGER, allowNull: false },
  key: { type: DataTypes.STRING(150), allowNull: false },
  status: { type: DataTypes.STRING(24), allowNull: false },
  dueAt: { type: DataTypes.DATE, allowNull: true },
  data: { type: DataTypes.JSON, allowNull: false },
}, {
  sequelize, tableName: 'platform_report_records',
  indexes: [
    { name: 'uq_platform_report_operation', unique: true, fields: ['kind', 'ownerId', 'key'] },
    { name: 'idx_platform_reports_owner_created', fields: ['ownerId', 'kind', 'createdAt'] },
    { name: 'idx_platform_reports_due', fields: ['kind', 'status', 'dueAt'] },
  ],
});
