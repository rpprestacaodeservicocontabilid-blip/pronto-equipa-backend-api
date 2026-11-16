import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

interface LoanDisbursementAttributes {
  id: string;
  companyId: number;
  loanId: string;
  amount: string;
  paymentReference: string | null;
  idempotencyKey: string;
  status: 'REQUESTED' | 'CONFIRMED' | 'FAILED';
  confirmedAt: Date | null;
  createdBy: number;
  createdAt: Date;
}

export class LoanDisbursementModel
  extends Model<
    LoanDisbursementAttributes,
    Optional<LoanDisbursementAttributes, 'id' | 'paymentReference' | 'confirmedAt' | 'createdAt'>
  >
  implements LoanDisbursementAttributes
{
  declare id: string;
  declare companyId: number;
  declare loanId: string;
  declare amount: string;
  declare paymentReference: string | null;
  declare idempotencyKey: string;
  declare status: 'REQUESTED' | 'CONFIRMED' | 'FAILED';
  declare confirmedAt: Date | null;
  declare createdBy: number;
  declare createdAt: Date;
}

LoanDisbursementModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    loanId: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    paymentReference: { type: DataTypes.STRING(200), allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(200), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'REQUESTED' },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'loan_disbursements',
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'idempotencyKey'],
        name: 'uq_loan_disbursement_idempotency',
      },
      {
        unique: true,
        fields: ['companyId', 'paymentReference'],
        name: 'uq_loan_disbursement_payment_reference',
      },
      { fields: ['companyId', 'loanId', 'status'], name: 'idx_loan_disbursement_status' },
    ],
  },
);
