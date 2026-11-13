import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

export interface LeaveEntitlementAttributes {
  id: string;
  companyId: number;
  accountId: string;
  accrualPeriodStart: string;
  accrualPeriodEnd: string;
  days: number;
  legalRuleVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `leave_entitlements` — direito adquirido num período de
 * aquisição (RF-002/005). Imutável após criação: correcções
 * passam por movimentos ADJUSTMENT (RN-008).
 */
export class LeaveEntitlementModel
  extends Model<
    LeaveEntitlementAttributes,
    Optional<LeaveEntitlementAttributes, 'legalRuleVersionId' | 'createdAt' | 'updatedAt'>
  >
  implements LeaveEntitlementAttributes
{
  declare id: string;
  declare companyId: number;
  declare accountId: string;
  declare accrualPeriodStart: string;
  declare accrualPeriodEnd: string;
  declare days: number;
  declare legalRuleVersionId: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

LeaveEntitlementModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
    },
    accountId: { type: DataTypes.UUID, allowNull: false },
    accrualPeriodStart: { type: DataTypes.DATEONLY, allowNull: false },
    accrualPeriodEnd: { type: DataTypes.DATEONLY, allowNull: false },
    days: { type: DataTypes.INTEGER, allowNull: false },
    legalRuleVersionId: { type: DataTypes.STRING(120), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'leave_entitlements',
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'accountId', 'accrualPeriodStart', 'accrualPeriodEnd'],
        name: 'uq_leave_entitlement_period',
      },
      { fields: ['companyId', 'accountId'], name: 'idx_leave_entitlement_account' },
    ],
  },
);
