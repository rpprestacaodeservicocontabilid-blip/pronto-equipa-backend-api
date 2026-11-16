import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

interface OrganizationHistoryAttributes {
  id: number;
  companyId: number;
  entityId: string;
  entityType: string;
  changeType: string;
  actorUserId: number | null;
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown>;
  createdAt: Date;
}

export class OrganizationHistoryModel
  extends Model<
    OrganizationHistoryAttributes,
    Optional<OrganizationHistoryAttributes, 'id' | 'createdAt'>
  >
  implements OrganizationHistoryAttributes
{
  declare id: number;
  declare companyId: number;
  declare entityId: string;
  declare entityType: string;
  declare changeType: string;
  declare actorUserId: number | null;
  declare previousData: Record<string, unknown> | null;
  declare newData: Record<string, unknown>;
  declare createdAt: Date;
}

OrganizationHistoryModel.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    entityId: { type: DataTypes.UUID, allowNull: false },
    entityType: { type: DataTypes.STRING(40), allowNull: false },
    changeType: { type: DataTypes.STRING(40), allowNull: false },
    actorUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    previousData: { type: DataTypes.JSON, allowNull: true },
    newData: { type: DataTypes.JSON, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'organization_structure_history',
    timestamps: false,
    indexes: [
      {
        fields: ['companyId', 'entityType', 'entityId', 'createdAt'],
        name: 'idx_org_history_entity',
      },
    ],
  },
);
