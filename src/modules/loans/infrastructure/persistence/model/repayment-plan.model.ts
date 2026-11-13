import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

interface RepaymentPlanAttributes {
  id: string;
  companyId: number;
  loanId: string;
  version: number;
  totalAmount: string;
  installmentCount: number;
  effectiveFrom: string;
  status: 'ACTIVE' | 'SUPERSEDED';
  createdAt: Date;
}

export class RepaymentPlanModel extends Model<
  RepaymentPlanAttributes,
  Optional<RepaymentPlanAttributes, 'id' | 'createdAt'>
> implements RepaymentPlanAttributes {
  declare id: string;
  declare companyId: number;
  declare loanId: string;
  declare version: number;
  declare totalAmount: string;
  declare installmentCount: number;
  declare effectiveFrom: string;
  declare status: 'ACTIVE' | 'SUPERSEDED';
  declare createdAt: Date;
}

RepaymentPlanModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    loanId: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    totalAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    installmentCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'loan_repayment_plans',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['companyId', 'loanId', 'version'], name: 'uq_loan_plan_version' },
      { fields: ['companyId', 'loanId', 'status'], name: 'idx_loan_plan_active' },
    ],
  },
);
