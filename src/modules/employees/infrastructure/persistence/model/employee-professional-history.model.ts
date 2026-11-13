import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

interface EmployeeProfessionalHistoryAttributes {
  id: number;
  companyId: number;
  employeeId: string;
  departmentId: number | null;
  jobTitle: string | null;
  jobCategory: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  reason: string | null;
  changedBy: number | null;
  createdAt: Date;
}

export class EmployeeProfessionalHistoryModel
  extends Model<
    EmployeeProfessionalHistoryAttributes,
    Optional<
      EmployeeProfessionalHistoryAttributes,
      'id' | 'effectiveTo' | 'reason' | 'changedBy' | 'createdAt'
    >
  >
  implements EmployeeProfessionalHistoryAttributes
{
  declare id: number;
  declare companyId: number;
  declare employeeId: string;
  declare departmentId: number | null;
  declare jobTitle: string | null;
  declare jobCategory: string | null;
  declare effectiveFrom: Date;
  declare effectiveTo: Date | null;
  declare reason: string | null;
  declare changedBy: number | null;
  declare createdAt: Date;
}

EmployeeProfessionalHistoryModel.init(
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
    departmentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    jobTitle: { type: DataTypes.STRING(150), allowNull: true },
    jobCategory: { type: DataTypes.STRING(100), allowNull: true },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    reason: { type: DataTypes.STRING(500), allowNull: true },
    changedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'employee_professional_history',
    timestamps: false,
    indexes: [
      {
        fields: ['companyId', 'employeeId', 'effectiveFrom'],
        name: 'idx_employee_professional_period',
      },
    ],
  },
);
