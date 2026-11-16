import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

interface LoanInstallmentAttributes {
  id: string;
  companyId: number;
  loanId: string;
  planId: string;
  installmentNumber: number;
  dueDate: string;
  principalDue: string;
  interestDue: string;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'SUSPENDED';
}

export class LoanInstallmentModel
  extends Model<LoanInstallmentAttributes, Optional<LoanInstallmentAttributes, 'id' | 'status'>>
  implements LoanInstallmentAttributes
{
  declare id: string;
  declare companyId: number;
  declare loanId: string;
  declare planId: string;
  declare installmentNumber: number;
  declare dueDate: string;
  declare principalDue: string;
  declare interestDue: string;
  declare status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'SUSPENDED';
}

LoanInstallmentModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    loanId: { type: DataTypes.UUID, allowNull: false },
    planId: { type: DataTypes.UUID, allowNull: false },
    installmentNumber: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    dueDate: { type: DataTypes.DATEONLY, allowNull: false },
    principalDue: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    interestDue: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING' },
  },
  {
    sequelize,
    tableName: 'loan_installments',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'planId', 'installmentNumber'],
        name: 'uq_loan_installment_number',
      },
      { fields: ['companyId', 'loanId', 'dueDate', 'status'], name: 'idx_loan_installment_due' },
    ],
  },
);
