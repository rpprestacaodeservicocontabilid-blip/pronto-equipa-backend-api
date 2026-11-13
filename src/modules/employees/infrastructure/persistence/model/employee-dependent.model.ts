import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

interface EmployeeDependentAttributes {
  id: string;
  companyId: number;
  employeeId: string;
  fullName: string;
  relationship: string;
  dateOfBirth: Date | null;
  fiscalDependent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class EmployeeDependentModel
  extends Model<
    EmployeeDependentAttributes,
    Optional<
      EmployeeDependentAttributes,
      'id' | 'dateOfBirth' | 'fiscalDependent' | 'createdAt' | 'updatedAt'
    >
  >
  implements EmployeeDependentAttributes
{
  declare id: string;
  declare companyId: number;
  declare employeeId: string;
  declare fullName: string;
  declare relationship: string;
  declare dateOfBirth: Date | null;
  declare fiscalDependent: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

EmployeeDependentModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
    },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    fullName: { type: DataTypes.STRING(200), allowNull: false },
    relationship: { type: DataTypes.STRING(80), allowNull: false },
    dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
    fiscalDependent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'employee_dependents',
    timestamps: true,
    indexes: [{ fields: ['companyId', 'employeeId'], name: 'idx_employee_dependents_employee' }],
  },
);
