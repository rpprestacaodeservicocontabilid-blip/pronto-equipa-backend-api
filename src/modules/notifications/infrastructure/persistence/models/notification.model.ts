import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';
export class NotificationRow extends Model {
  declare id: string;
  declare companyId: number | null;
  declare scopeKey: string;
  declare kind: string;
  declare key: string;
  declare status: string;
  declare userId: number | null;
  declare data: Record<string, any>;
}
NotificationRow.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER, allowNull: true },
    scopeKey: { type: DataTypes.STRING(80), allowNull: false },
    kind: { type: DataTypes.STRING(40), allowNull: false },
    key: { type: DataTypes.STRING(240), allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    data: { type: DataTypes.JSON, allowNull: false },
  },
  {
    sequelize,
    tableName: 'communication_records',
    indexes: [
      { unique: true, fields: ['scopeKey', 'kind', 'key'] },
      { fields: ['companyId', 'userId', 'kind', 'status'] },
    ],
  },
);
