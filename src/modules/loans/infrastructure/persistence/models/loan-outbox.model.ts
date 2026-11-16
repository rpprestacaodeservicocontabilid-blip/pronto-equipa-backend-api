import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

interface LoanOutboxAttributes {
  id: number;
  companyId: number;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  publishedAt: Date | null;
}

export class LoanOutboxModel
  extends Model<LoanOutboxAttributes, Optional<LoanOutboxAttributes, 'id' | 'publishedAt'>>
  implements LoanOutboxAttributes
{
  declare id: number;
  declare companyId: number;
  declare aggregateId: string;
  declare eventType: string;
  declare payload: Record<string, unknown>;
  declare occurredAt: Date;
  declare publishedAt: Date | null;
}

LoanOutboxModel.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    aggregateId: { type: DataTypes.UUID, allowNull: false },
    eventType: { type: DataTypes.STRING(100), allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: false },
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'loan_outbox',
    timestamps: false,
    indexes: [{ fields: ['publishedAt', 'occurredAt'], name: 'idx_loan_outbox_pending' }],
  },
);
