import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

export interface LeaveRequestPeriodAttributes {
  id: string;
  companyId: number;
  requestId: string;
  startDate: string;
  endDate: string;
  calculatedDays: number;
  createdAt: Date;
}

/** `leave_request_periods` — segmentos do pedido (RF-017/019). */
export class LeaveRequestPeriodModel
  extends Model<LeaveRequestPeriodAttributes, Optional<LeaveRequestPeriodAttributes, 'createdAt'>>
  implements LeaveRequestPeriodAttributes
{
  declare id: string;
  declare companyId: number;
  declare requestId: string;
  declare startDate: string;
  declare endDate: string;
  declare calculatedDays: number;
  declare createdAt: Date;
}

LeaveRequestPeriodModel.init(
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
    calculatedDays: { type: DataTypes.INTEGER, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'leave_request_periods',
    timestamps: false,
    indexes: [
      { fields: ['companyId', 'requestId'], name: 'idx_leave_period_request' },
      { fields: ['companyId', 'startDate', 'endDate'], name: 'idx_leave_period_range' },
    ],
  },
);
