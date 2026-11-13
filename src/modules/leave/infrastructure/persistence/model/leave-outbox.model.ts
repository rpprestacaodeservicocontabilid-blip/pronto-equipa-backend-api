import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

export interface LeaveOutboxAttributes {
  id: number;
  companyId: number;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  publishedAt: Date | null;
}

/**
 * `leave_outbox` — outbox transaccional dos eventos do módulo.
 *
 * Escrito na MESMA transacção da operação; `publishedAt: null`
 * marca o evento por publicar. Nada consome esta tabela ainda —
 * o publicador é trabalho futuro (CA-020 fica satisfeito ao
 * preservar o evento para nova tentativa).
 */
export class LeaveOutboxModel
  extends Model<LeaveOutboxAttributes, Optional<LeaveOutboxAttributes, 'id' | 'publishedAt'>>
  implements LeaveOutboxAttributes
{
  declare id: number;
  declare companyId: number;
  declare aggregateId: string;
  declare eventType: string;
  declare payload: Record<string, unknown>;
  declare occurredAt: Date;
  declare publishedAt: Date | null;
}

LeaveOutboxModel.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    companyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
    },
    aggregateId: { type: DataTypes.UUID, allowNull: false },
    eventType: { type: DataTypes.STRING(80), allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: false },
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'leave_outbox',
    updatedAt: false,
    indexes: [{ fields: ['publishedAt', 'occurredAt'], name: 'idx_leave_outbox_pending' }],
  },
);
