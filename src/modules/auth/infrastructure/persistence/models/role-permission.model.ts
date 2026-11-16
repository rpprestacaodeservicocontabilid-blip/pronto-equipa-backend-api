import { DataTypes, Model, Optional } from 'sequelize';

import { sequelize } from '../../../../../infra/database/index';

interface RolePermissionAttributes {
  id: number;
  roleId: number;
  permissionId: number;
  createdAt: Date;
}

export class RolePermissionModel extends Model<
  RolePermissionAttributes,
  Optional<RolePermissionAttributes, 'id'>
> {
  declare id: number;

  declare roleId: number;

  declare permissionId: number;

  declare createdAt: Date;
}

RolePermissionModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    permissionId: {
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
    tableName: 'role_permissions',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['roleId', 'permissionId'],
      },
    ],
  },
);
