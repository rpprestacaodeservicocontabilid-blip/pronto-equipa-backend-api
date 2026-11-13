import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

interface OrganizationOutboxAttributes {
  id: number;
  companyId: number;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  publishedAt: Date | null;
}

export class OrganizationOutboxModel
  extends Model<
    OrganizationOutboxAttributes,
    Optional<OrganizationOutboxAttributes, 'id' | 'publishedAt'>
  >
  implements OrganizationOutboxAttributes
{
  declare id: number;
  declare companyId: number;
  declare aggregateId: string;
  declare eventType: string;
  declare payload: Record<string, unknown>;
  declare occurredAt: Date;
  declare publishedAt: Date | null;
}

OrganizationOutboxModel.init(
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
    tableName: 'organization_outbox',
    updatedAt: false,
    indexes: [{ fields: ['publishedAt', 'occurredAt'], name: 'idx_org_outbox_pending' }],
  },
);
