import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

interface LoanApprovalAttributes {
  id: string;
  companyId: number;
  applicationId: string;
  approverId: number;
  decision: 'APPROVED' | 'REJECTED';
  comments: string | null;
  decidedAt: Date;
}

export class LoanApprovalModel
  extends Model<LoanApprovalAttributes>
  implements LoanApprovalAttributes
{
  declare id: string;
  declare companyId: number;
  declare applicationId: string;
  declare approverId: number;
  declare decision: 'APPROVED' | 'REJECTED';
  declare comments: string | null;
  declare decidedAt: Date;
}

LoanApprovalModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    applicationId: { type: DataTypes.UUID, allowNull: false },
    approverId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    decision: { type: DataTypes.STRING(20), allowNull: false },
    comments: { type: DataTypes.STRING(2000), allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'loan_approvals',
    timestamps: false,
    indexes: [
      {
        fields: ['companyId', 'applicationId', 'decidedAt'],
        name: 'idx_loan_approval_application',
      },
    ],
  },
);
