import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

export interface LeaveApprovalAttributes {
  id: number;
  companyId: number;
  requestId: string;
  approverUserId: number;
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED';
  comments: string | null;
  decidedAt: Date;
  createdAt: Date;
}

/**
 * `leave_approvals` — decisões imutáveis: data, responsável e
 * resultado (RN-031 / RF-031).
 */
export class LeaveApprovalModel
  extends Model<
    LeaveApprovalAttributes,
    Optional<LeaveApprovalAttributes, 'id' | 'comments' | 'createdAt'>
  >
  implements LeaveApprovalAttributes
{
  declare id: number;
  declare companyId: number;
  declare requestId: string;
  declare approverUserId: number;
  declare decision: LeaveApprovalAttributes['decision'];
  declare comments: string | null;
  declare decidedAt: Date;
  declare createdAt: Date;
}

LeaveApprovalModel.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    companyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
    },
    requestId: { type: DataTypes.UUID, allowNull: false },
    approverUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    decision: { type: DataTypes.STRING(20), allowNull: false },
    comments: { type: DataTypes.STRING(1000), allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'leave_approvals',
    timestamps: false,
    indexes: [
      { fields: ['companyId', 'requestId', 'decidedAt'], name: 'idx_leave_approval_request' },
    ],
  },
);
