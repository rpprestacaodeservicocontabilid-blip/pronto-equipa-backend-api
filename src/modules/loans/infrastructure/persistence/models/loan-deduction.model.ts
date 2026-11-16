import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

interface LoanDeductionAttributes {
  id: string;
  companyId: number;
  loanId: string;
  installmentId: string;
  payrollRunId: string | null;
  requestedAmount: string;
  confirmedAmount: string | null;
  createdBy: number;
  status: 'REQUESTED' | 'CONFIRMED' | 'PARTIAL' | 'REJECTED' | 'REVERSED';
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export class LoanDeductionModel
  extends Model<
    LoanDeductionAttributes,
    Optional<
      LoanDeductionAttributes,
      'id' | 'payrollRunId' | 'confirmedAmount' | 'status' | 'createdAt' | 'updatedAt'
    >
  >
  implements LoanDeductionAttributes
{
  declare id: string;
  declare companyId: number;
  declare loanId: string;
  declare installmentId: string;
  declare payrollRunId: string | null;
  declare requestedAmount: string;
  declare confirmedAmount: string | null;
  declare createdBy: number;
  declare status: 'REQUESTED' | 'CONFIRMED' | 'PARTIAL' | 'REJECTED' | 'REVERSED';
  declare idempotencyKey: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

LoanDeductionModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    loanId: { type: DataTypes.UUID, allowNull: false },
    installmentId: { type: DataTypes.UUID, allowNull: false },
    payrollRunId: { type: DataTypes.STRING(150), allowNull: true },
    requestedAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    confirmedAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'REQUESTED' },
    idempotencyKey: { type: DataTypes.STRING(200), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'loan_payroll_deductions',
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'idempotencyKey'],
        name: 'uq_loan_deduction_idempotency',
      },
      {
        unique: true,
        fields: ['companyId', 'payrollRunId', 'installmentId'],
        name: 'uq_loan_deduction_payroll',
      },
      { fields: ['companyId', 'loanId', 'status'], name: 'idx_loan_deduction_status' },
    ],
  },
);
