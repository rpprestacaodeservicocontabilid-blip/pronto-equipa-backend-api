import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';
export class BillingRecord extends Model {
  declare id: string;
  declare companyId: number;
  declare kind: string;
  declare key: string;
  declare status: string;
  declare data: Record<string, any>;
}
BillingRecord.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
    kind: { type: DataTypes.STRING(40), allowNull: false },
    key: { type: DataTypes.STRING(240), allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false },
    data: { type: DataTypes.JSONB, allowNull: false },
  },
  {
    sequelize,
    tableName: 'platform_billing_records',
    indexes: [{ unique: true, fields: ['companyId', 'kind', 'key'] }],
  },
);
