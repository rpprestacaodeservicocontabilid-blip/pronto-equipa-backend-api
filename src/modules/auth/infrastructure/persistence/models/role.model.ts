import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';

import { sequelize } from '../../../../../infra/database/index';

export class RoleModel extends Model<
  InferAttributes<RoleModel>,
  InferCreationAttributes<RoleModel>
> {
  declare id: number;

  declare name: string;

  declare description: string | null;

  declare createdAt: Date;

  declare updatedAt: Date;
}

RoleModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },

    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'auth_roles',
    timestamps: true,
  },
);
