import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

interface EmployeeBankAccountAttributes {
  id: string;
  companyId: number;
  employeeId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban: string | null;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export class EmployeeBankAccountModel
  extends Model<
    EmployeeBankAccountAttributes,
    Optional<EmployeeBankAccountAttributes, 'id' | 'iban' | 'currency' | 'createdAt' | 'updatedAt'>
  >
  implements EmployeeBankAccountAttributes
{
  declare id: string;
  declare companyId: number;
  declare employeeId: string;
  declare bankName: string;
  declare accountName: string;
  declare accountNumber: string;
  declare iban: string | null;
  declare currency: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

EmployeeBankAccountModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
    },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    bankName: { type: DataTypes.STRING(120), allowNull: false },
    accountName: { type: DataTypes.STRING(150), allowNull: false },
    accountNumber: { type: DataTypes.STRING(50), allowNull: false },
    iban: { type: DataTypes.STRING(34), allowNull: true },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'AOA' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'employee_bank_accounts',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['companyId', 'employeeId'], name: 'uq_employee_bank_employee' },
    ],
  },
);
