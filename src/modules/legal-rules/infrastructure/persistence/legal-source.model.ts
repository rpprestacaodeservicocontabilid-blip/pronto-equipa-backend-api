import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../../../infra/database';
import type { LegalSourceInput } from '../../domain/legal-governance';

export class LegalSourceModel extends Model {
  declare id: string;
  declare reference: string;
  declare data: LegalSourceInput;
  declare createdAt: Date;
  declare createdBy: number;
}

LegalSourceModel.init({
  id: { type: DataTypes.UUID, primaryKey: true },
  reference: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  data: { type: DataTypes.JSON, allowNull: false },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  createdBy: { type: DataTypes.INTEGER, allowNull: false },
}, { sequelize, tableName: 'legal_sources', timestamps: false });
