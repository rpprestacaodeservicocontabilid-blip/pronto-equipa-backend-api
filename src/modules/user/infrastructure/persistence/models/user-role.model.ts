import { DataTypes, Model } from 'sequelize';

import { sequelize } from '../../../../../infra/database';

export interface UserRoleModelAttributes {
  userId: number;
  roleId: number;

  createdAt: Date;
}

export class UserRoleModel
  extends Model<UserRoleModelAttributes>
  implements UserRoleModelAttributes
{
  declare userId: number;
  declare roleId: number;

  declare createdAt: Date;
}

UserRoleModel.init(
  {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },

    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },

    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'user_roles',
    modelName: 'UserRole',
    timestamps: false,

    indexes: [
      {
        fields: ['userId'],
      },
      {
        fields: ['roleId'],
      },
    ],
  },
);
