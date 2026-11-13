import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

interface ContractRecordAttributes {
  id: number;
  companyId: number;
  contractId: string;
  type: string;
  actorUserId: number | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export class ContractRecordModel
  extends Model<ContractRecordAttributes, Optional<ContractRecordAttributes, 'id' | 'createdAt'>>
  implements ContractRecordAttributes
{
  declare id: number;
  declare companyId: number;
  declare contractId: string;
  declare type: string;
  declare actorUserId: number;
  declare payload: Record<string, unknown>;
  declare createdAt: Date;
}

ContractRecordModel.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    contractId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING(40), allowNull: false },
    actorUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    payload: { type: DataTypes.JSON, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'contract_records',
    updatedAt: false,
    indexes: [
      { fields: ['companyId', 'contractId', 'createdAt'], name: 'idx_contract_record_history' },
    ],
  },
);
