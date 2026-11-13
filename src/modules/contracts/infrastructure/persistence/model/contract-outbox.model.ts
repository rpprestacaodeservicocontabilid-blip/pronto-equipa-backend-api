import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

interface ContractOutboxAttributes {
  id: number;
  companyId: number;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  publishedAt: Date | null;
}

export class ContractOutboxModel
  extends Model<ContractOutboxAttributes, Optional<ContractOutboxAttributes, 'id' | 'publishedAt'>>
  implements ContractOutboxAttributes
{
  declare id: number;
  declare companyId: number;
  declare aggregateId: string;
  declare eventType: string;
  declare payload: Record<string, unknown>;
  declare occurredAt: Date;
  declare publishedAt: Date | null;
}

ContractOutboxModel.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    aggregateId: { type: DataTypes.UUID, allowNull: false },
    eventType: { type: DataTypes.STRING(80), allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: false },
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'contract_outbox', updatedAt: false },
);
