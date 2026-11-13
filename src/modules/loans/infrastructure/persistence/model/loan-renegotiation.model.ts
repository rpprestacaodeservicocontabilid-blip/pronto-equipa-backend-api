import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

interface LoanRenegotiationAttributes {
  id: string;
  companyId: number;
  loanId: string;
  previousPlanId: string;
  newPlanId: string | null;
  installmentCount: number;
  firstDueDate: string;
  frequency: 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY';
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: number;
  decidedBy: number | null;
  decidedAt: Date | null;
  createdAt: Date;
}

export class LoanRenegotiationModel extends Model<
  LoanRenegotiationAttributes,
  Optional<LoanRenegotiationAttributes, 'id' | 'newPlanId' | 'decidedBy' | 'decidedAt' | 'createdAt'>
> implements LoanRenegotiationAttributes {
  declare id: string;
  declare companyId: number;
  declare loanId: string;
  declare previousPlanId: string;
  declare newPlanId: string | null;
  declare installmentCount: number;
  declare firstDueDate: string;
  declare frequency: 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY';
  declare reason: string;
  declare status: 'PENDING' | 'APPROVED' | 'REJECTED';
  declare requestedBy: number;
  declare decidedBy: number | null;
  declare decidedAt: Date | null;
  declare createdAt: Date;
}

LoanRenegotiationModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    loanId: { type: DataTypes.UUID, allowNull: false },
    previousPlanId: { type: DataTypes.UUID, allowNull: false },
    newPlanId: { type: DataTypes.UUID, allowNull: true },
    installmentCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    firstDueDate: { type: DataTypes.DATEONLY, allowNull: false },
    frequency: { type: DataTypes.STRING(20), allowNull: false },
    reason: { type: DataTypes.STRING(2000), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING' },
    requestedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    decidedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'loan_renegotiations',
    indexes: [{ fields: ['companyId', 'loanId', 'status'], name: 'idx_loan_renegotiation_status' }],
  },
);
