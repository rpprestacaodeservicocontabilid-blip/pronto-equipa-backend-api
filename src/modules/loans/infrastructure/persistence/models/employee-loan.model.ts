import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';
import { LoanApplicationStatus } from './loan-application.model';

interface EmployeeLoanAttributes {
  id: string;
  companyId: number;
  employeeId: string;
  applicationId: string;
  loanNumber: string;
  principalAmount: string;
  currency: string;
  status: LoanApplicationStatus;
  version: number;
  disbursedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class EmployeeLoanModel
  extends Model<
    EmployeeLoanAttributes,
    Optional<EmployeeLoanAttributes, 'id' | 'disbursedAt' | 'createdAt' | 'updatedAt'>
  >
  implements EmployeeLoanAttributes
{
  declare id: string;
  declare companyId: number;
  declare employeeId: string;
  declare applicationId: string;
  declare loanNumber: string;
  declare principalAmount: string;
  declare currency: string;
  declare status: LoanApplicationStatus;
  declare version: number;
  declare disbursedAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

EmployeeLoanModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    applicationId: { type: DataTypes.UUID, allowNull: false },
    loanNumber: { type: DataTypes.STRING(50), allowNull: false },
    principalAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    disbursedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'employee_loans',
    indexes: [
      { unique: true, fields: ['companyId', 'loanNumber'], name: 'uq_loan_company_number' },
      { unique: true, fields: ['companyId', 'applicationId'], name: 'uq_loan_application' },
      { fields: ['companyId', 'employeeId', 'status'], name: 'idx_loan_employee_status' },
      { unique: true, fields: ['companyId', 'id'], name: 'uq_loan_company_id' },
    ],
  },
);
