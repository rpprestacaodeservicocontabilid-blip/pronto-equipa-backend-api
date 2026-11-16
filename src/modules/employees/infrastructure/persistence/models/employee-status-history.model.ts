import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

interface EmployeeStatusHistoryAttributes {
  id: number;
  companyId: number;
  employeeId: string;
  fromStatus: string | null;
  toStatus: string;
  effectiveAt: Date;
  reason: string | null;
  actorUserId: number | null;
  createdAt: Date;
}

export class EmployeeStatusHistoryModel
  extends Model<
    EmployeeStatusHistoryAttributes,
    Optional<
      EmployeeStatusHistoryAttributes,
      'id' | 'fromStatus' | 'reason' | 'actorUserId' | 'createdAt'
    >
  >
  implements EmployeeStatusHistoryAttributes
{
  declare id: number;
  declare companyId: number;
  declare employeeId: string;
  declare fromStatus: string | null;
  declare toStatus: string;
  declare effectiveAt: Date;
  declare reason: string | null;
  declare actorUserId: number | null;
  declare createdAt: Date;
}

EmployeeStatusHistoryModel.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    companyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'employees', key: 'id' },
    },
    fromStatus: { type: DataTypes.STRING(30), allowNull: true },
    toStatus: { type: DataTypes.STRING(30), allowNull: false },
    effectiveAt: { type: DataTypes.DATE, allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: true },
    actorUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'employee_status_history',
    timestamps: false,
    indexes: [
      { fields: ['companyId', 'employeeId', 'effectiveAt'], name: 'idx_employee_status_period' },
    ],
  },
);
