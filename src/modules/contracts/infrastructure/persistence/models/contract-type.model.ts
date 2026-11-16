import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

interface ContractTypeAttributes {
  id: number;
  companyId: number | null;
  code: string;
  name: string;
  legalRuleVersionId: string | null;
  requiresEndDate: boolean;
  maxRenewals: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ContractTypeModel
  extends Model<
    ContractTypeAttributes,
    Optional<ContractTypeAttributes, 'id' | 'companyId' | 'maxRenewals' | 'createdAt' | 'updatedAt'>
  >
  implements ContractTypeAttributes
{
  declare id: number;
  declare companyId: number | null;
  declare code: string;
  declare name: string;
  declare legalRuleVersionId: string | null;
  declare requiresEndDate: boolean;
  declare maxRenewals: number | null;
  declare active: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

ContractTypeModel.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    code: { type: DataTypes.STRING(50), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    legalRuleVersionId: { type: DataTypes.STRING(120), allowNull: true },
    requiresEndDate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    maxRenewals: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'contract_types',
    indexes: [
      { unique: true, fields: ['companyId', 'code'], name: 'uq_contract_type_company_code' },
    ],
  },
);
