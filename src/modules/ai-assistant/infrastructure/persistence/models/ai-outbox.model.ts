import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

export interface AiOutboxAttributes {
  id: number;
  companyId: number | null;
  eventName: string;
  aggregateId: string;
  userId: number | null;
  payload: Record<string, unknown>;
  idempotencyKey: string | null;
  occurredAt: Date;
  publishedAt: Date | null;
}

/**
 * `ai_outbox` — outbox transaccional do assistente (secção 17.1,
 * RN-AI-028).
 *
 * Os eventos são gravados na MESMA transacção da operação;
 * `publishedAt: null` marca o evento por propagar. Uma falha de
 * propagação nunca compromete a transacção de negócio.
 */
export class AiOutboxModel
  extends Model<
    AiOutboxAttributes,
    Optional<AiOutboxAttributes, 'userId' | 'idempotencyKey' | 'publishedAt'>
  >
  implements AiOutboxAttributes
{
  declare id: number;
  declare companyId: number | null;
  declare eventName: string;
  declare aggregateId: string;
  declare userId: number | null;
  declare payload: Record<string, unknown>;
  declare idempotencyKey: string | null;
  declare occurredAt: Date;
  declare publishedAt: Date | null;
}

AiOutboxModel.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    companyId: { type: DataTypes.INTEGER, allowNull: true },
    eventName: { type: DataTypes.STRING(80), allowNull: false },
    aggregateId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    payload: { type: DataTypes.JSON, allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(200), allowNull: true },
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'ai_outbox',
    updatedAt: false,
    indexes: [
      { fields: ['publishedAt', 'occurredAt'], name: 'idx_ai_outbox_pending' },
      { fields: ['companyId', 'eventName'] },
    ],
  },
);
