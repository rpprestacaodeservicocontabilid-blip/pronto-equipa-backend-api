import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

export type LoanType = 'LOAN' | 'SALARY_ADVANCE' | 'EXTRAORDINARY_ADVANCE';
export type LoanApplicationStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'PENDING_DISBURSEMENT'
  | 'DISBURSEMENT_FAILED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'SETTLED'
  | 'CLOSED';

export interface LoanApplicationAttributes {
  id: string;
  companyId: number;
  employeeId: string;
  loanType: LoanType;
  requestedAmount: string;
  currency: string;
  installmentCount: number;
  frequency: 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY';
  firstDueDate: string;
  annualInterestBps: number;
  status: LoanApplicationStatus;
  reason: string;
  version: number;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

export class LoanApplicationModel
  extends Model<
    LoanApplicationAttributes,
    Optional<LoanApplicationAttributes, 'id' | 'status' | 'version' | 'createdAt' | 'updatedAt'>
  >
  implements LoanApplicationAttributes
{
  declare id: string;
  declare companyId: number;
  declare employeeId: string;
  declare loanType: LoanType;
  declare requestedAmount: string;
  declare currency: string;
  declare installmentCount: number;
  declare frequency: 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY';
  declare firstDueDate: string;
  declare annualInterestBps: number;
  declare status: LoanApplicationStatus;
  declare reason: string;
  declare version: number;
  declare createdBy: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

LoanApplicationModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    loanType: { type: DataTypes.STRING(30), allowNull: false },
    requestedAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    installmentCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    frequency: { type: DataTypes.STRING(20), allowNull: false },
    firstDueDate: { type: DataTypes.DATEONLY, allowNull: false },
    annualInterestBps: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'DRAFT' },
    reason: { type: DataTypes.STRING(2000), allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'loan_applications',
    indexes: [
      { fields: ['companyId', 'employeeId', 'status'], name: 'idx_loan_application_employee' },
      { fields: ['companyId', 'status', 'createdAt'], name: 'idx_loan_application_status' },
      { unique: true, fields: ['companyId', 'id'], name: 'uq_loan_application_company_id' },
    ],
  },
);
