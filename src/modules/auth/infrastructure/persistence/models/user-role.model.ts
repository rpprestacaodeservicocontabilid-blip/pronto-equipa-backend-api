import { DataTypes, Model, Optional } from 'sequelize';

import { sequelize } from '../../../../../infra/database/index';

interface UserRoleAttributes {
  id: number;
  userId: number;
  roleId: number;
  createdAt: Date;
}

export class UserRoleModel extends Model<UserRoleAttributes, Optional<UserRoleAttributes, 'id'>> {
  declare id: number;

  declare userId: number;

  declare roleId: number;

  declare createdAt: Date;
}

UserRoleModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'user_roles',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['userId', 'roleId'],
      },
    ],
  },
);
