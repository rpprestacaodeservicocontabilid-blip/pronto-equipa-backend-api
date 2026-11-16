import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

interface LoanRepaymentAttributes {
  id: string;
  companyId: number;
  loanId: string;
  amount: string;
  currency: string;
  source: string;
  externalReference: string | null;
  idempotencyKey: string;
  status: 'CONFIRMED' | 'REVERSED';
  createdBy: number | null;
  createdAt: Date;
}

export class LoanRepaymentModel
  extends Model<
    LoanRepaymentAttributes,
    Optional<LoanRepaymentAttributes, 'id' | 'externalReference' | 'createdBy' | 'createdAt'>
  >
  implements LoanRepaymentAttributes
{
  declare id: string;
  declare companyId: number;
  declare loanId: string;
  declare amount: string;
  declare currency: string;
  declare source: string;
  declare externalReference: string | null;
  declare idempotencyKey: string;
  declare status: 'CONFIRMED' | 'REVERSED';
  declare createdBy: number | null;
  declare createdAt: Date;
}

LoanRepaymentModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    loanId: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    source: { type: DataTypes.STRING(40), allowNull: false },
    externalReference: { type: DataTypes.STRING(200), allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(200), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'CONFIRMED' },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'loan_repayments',
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'source', 'idempotencyKey'],
        name: 'uq_loan_repayment_idempotency',
      },
      {
        unique: true,
        fields: ['companyId', 'source', 'externalReference'],
        name: 'uq_loan_repayment_external_reference',
      },
      { fields: ['companyId', 'loanId', 'createdAt'], name: 'idx_loan_repayment_history' },
    ],
  },
);
