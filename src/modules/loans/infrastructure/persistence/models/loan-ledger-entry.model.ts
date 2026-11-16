import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

export type LoanLedgerEntryType = 'DISBURSEMENT' | 'REPAYMENT' | 'REVERSAL' | 'WRITE_OFF';

interface LoanLedgerEntryAttributes {
  id: string;
  companyId: number;
  loanId: string;
  installmentId: string | null;
  entryType: LoanLedgerEntryType;
  principalAmount: string;
  interestAmount: string;
  currency: string;
  source: string;
  externalReference: string | null;
  idempotencyKey: string;
  occurredAt: Date;
  createdBy: number | null;
}

export class LoanLedgerEntryModel
  extends Model<
    LoanLedgerEntryAttributes,
    Optional<LoanLedgerEntryAttributes, 'id' | 'installmentId' | 'externalReference' | 'createdBy'>
  >
  implements LoanLedgerEntryAttributes
{
  declare id: string;
  declare companyId: number;
  declare loanId: string;
  declare installmentId: string | null;
  declare entryType: LoanLedgerEntryType;
  declare principalAmount: string;
  declare interestAmount: string;
  declare currency: string;
  declare source: string;
  declare externalReference: string | null;
  declare idempotencyKey: string;
  declare occurredAt: Date;
  declare createdBy: number | null;
}

LoanLedgerEntryModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    loanId: { type: DataTypes.UUID, allowNull: false },
    installmentId: { type: DataTypes.UUID, allowNull: true },
    entryType: { type: DataTypes.STRING(20), allowNull: false },
    principalAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    interestAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    source: { type: DataTypes.STRING(40), allowNull: false },
    externalReference: { type: DataTypes.STRING(200), allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(200), allowNull: false },
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  },
  {
    sequelize,
    tableName: 'loan_ledger_entries',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'source', 'idempotencyKey'],
        name: 'uq_loan_ledger_idempotency',
      },
      { fields: ['companyId', 'loanId', 'occurredAt'], name: 'idx_loan_ledger_history' },
      { fields: ['companyId', 'loanId', 'installmentId'], name: 'idx_loan_ledger_installment' },
    ],
  },
);
