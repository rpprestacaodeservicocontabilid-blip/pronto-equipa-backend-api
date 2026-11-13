import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

interface ContractAlertAttributes {
  id: number;
  companyId: number;
  contractId: string;
  alertType: string;
  scheduledAt: Date;
  sentAt: Date | null;
}

export class ContractAlertModel
  extends Model<ContractAlertAttributes, Optional<ContractAlertAttributes, 'id' | 'sentAt'>>
  implements ContractAlertAttributes
{
  declare id: number;
  declare companyId: number;
  declare contractId: string;
  declare alertType: string;
  declare scheduledAt: Date;
  declare sentAt: Date | null;
}

ContractAlertModel.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    contractId: { type: DataTypes.UUID, allowNull: false },
    alertType: { type: DataTypes.STRING(30), allowNull: false },
    scheduledAt: { type: DataTypes.DATE, allowNull: false },
    sentAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'contract_alerts',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'contractId', 'alertType'],
        name: 'uq_contract_alert_once',
      },
      { fields: ['companyId', 'scheduledAt', 'sentAt'], name: 'idx_contract_alert_pending' },
    ],
  },
);
