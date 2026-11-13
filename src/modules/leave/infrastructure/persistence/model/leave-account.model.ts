import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

export interface LeaveAccountAttributes {
  id: string;
  companyId: number;
  employeeId: string;
  status: 'ACTIVE' | 'CLOSED';
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `leave_accounts` — conta de férias de um trabalhador.
 * Única por (empresa, trabalhador): CA-002.
 */
export class LeaveAccountModel
  extends Model<
    LeaveAccountAttributes,
    Optional<LeaveAccountAttributes, 'status' | 'version' | 'createdAt' | 'updatedAt'>
  >
  implements LeaveAccountAttributes
{
  declare id: string;
  declare companyId: number;
  declare employeeId: string;
  declare status: 'ACTIVE' | 'CLOSED';
  declare version: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

LeaveAccountModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
    },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'leave_accounts',
    indexes: [
      { unique: true, fields: ['companyId', 'employeeId'], name: 'uq_leave_account_employee' },
      { fields: ['companyId', 'status'], name: 'idx_leave_account_company_status' },
    ],
  },
);
