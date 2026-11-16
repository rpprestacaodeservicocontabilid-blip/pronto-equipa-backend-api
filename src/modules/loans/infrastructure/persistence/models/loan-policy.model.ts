import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

interface LoanPolicyAttributes {
  id: string;
  companyId: number;
  code: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
  maxAmount: string;
  maxInstallments: number;
  maxActiveLoans: number;
  allowedTypes: string[];
  interestAllowed: boolean;
  maxAnnualInterestBps: number;
  deductionAuthorizationRequired: boolean;
  createdBy: number;
  createdAt: Date;
}

export class LoanPolicyModel
  extends Model<
    LoanPolicyAttributes,
    Optional<LoanPolicyAttributes, 'id' | 'version' | 'effectiveTo' | 'createdAt'>
  >
  implements LoanPolicyAttributes
{
  declare id: string;
  declare companyId: number;
  declare code: string;
  declare version: number;
  declare effectiveFrom: string;
  declare effectiveTo: string | null;
  declare active: boolean;
  declare maxAmount: string;
  declare maxInstallments: number;
  declare maxActiveLoans: number;
  declare allowedTypes: string[];
  declare interestAllowed: boolean;
  declare maxAnnualInterestBps: number;
  declare deductionAuthorizationRequired: boolean;
  declare createdBy: number;
  declare createdAt: Date;
}

LoanPolicyModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    code: { type: DataTypes.STRING(50), allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    maxAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    maxInstallments: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    maxActiveLoans: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    allowedTypes: { type: DataTypes.JSON, allowNull: false },
    interestAllowed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    maxAnnualInterestBps: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    deductionAuthorizationRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'loan_policies',
    timestamps: false,
    indexes: [
      {
        fields: ['companyId', 'code', 'active', 'effectiveFrom'],
        name: 'idx_loan_policy_effective',
      },
      { unique: true, fields: ['companyId', 'code', 'version'], name: 'uq_loan_policy_version' },
    ],
  },
);
