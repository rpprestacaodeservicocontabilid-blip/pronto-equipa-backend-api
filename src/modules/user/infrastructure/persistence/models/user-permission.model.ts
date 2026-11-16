import { DataTypes, Model } from 'sequelize';

import { sequelize } from '../../../../../infra/database';

export interface UserPermissionModelAttributes {
  userId: number;
  permissionId: number;

  assignedBy: number | null;

  createdAt: Date;
}

export class UserPermissionModel
  extends Model<UserPermissionModelAttributes>
  implements UserPermissionModelAttributes
{
  declare userId: number;
  declare permissionId: number;

  declare assignedBy: number | null;

  declare createdAt: Date;
}

UserPermissionModel.init(
  {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    permissionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    assignedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'user_permissions',
    modelName: 'UserPermission',
    timestamps: false,

    indexes: [
      {
        unique: true,
        fields: ['userId', 'permissionId'],
      },
    ],
  },
);
