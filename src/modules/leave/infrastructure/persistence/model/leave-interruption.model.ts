import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

export interface LeaveInterruptionAttributes {
  id: string;
  companyId: number;
  requestId: string;
  startDate: string;
  endDate: string;
  reason: string;
  actorUserId: number | null;
  createdAt: Date;
}

/** `leave_interruptions` — interrupções autorizadas (RF-045). */
export class LeaveInterruptionModel
  extends Model<
    LeaveInterruptionAttributes,
    Optional<LeaveInterruptionAttributes, 'actorUserId' | 'createdAt'>
  >
  implements LeaveInterruptionAttributes
{
  declare id: string;
  declare companyId: number;
  declare requestId: string;
  declare startDate: string;
  declare endDate: string;
  declare reason: string;
  declare actorUserId: number | null;
  declare createdAt: Date;
}

LeaveInterruptionModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
    },
    requestId: { type: DataTypes.UUID, allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: false },
    actorUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'leave_interruptions',
    timestamps: false,
    indexes: [
      { fields: ['companyId', 'requestId'], name: 'idx_leave_interruption_request' },
      { fields: ['companyId', 'startDate', 'endDate'], name: 'idx_leave_interruption_range' },
    ],
  },
);
