import { DataTypes, Model, Optional } from 'sequelize';

import { sequelize } from '../../../../../infra/database';

export interface UserModelAttributes {
  id: number;

  name: string;

  email: string;

  phone: string | null;

  type: string;

  status: string;

  profileId: number | null;

  emailVerifiedAt: Date | null;

  termsAcceptedAt: Date | null;

  lastLoginAt: Date | null;

  createdAt: Date;

  updatedAt: Date;

  deletedAt: Date | null;
  identityDisabledAt: Date | null;
}

export interface UserCreationAttributes extends Optional<
  UserModelAttributes,
  | 'id'
  | 'phone'
  | 'status'
  | 'profileId'
  | 'emailVerifiedAt'
  | 'termsAcceptedAt'
  | 'lastLoginAt'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
  | 'identityDisabledAt'
> {}

export class UserModel
  extends Model<UserModelAttributes, UserCreationAttributes>
  implements UserModelAttributes
{
  declare id: number;

  declare name: string;

  declare email: string;

  declare phone: string | null;

  declare type: string;

  declare status: string;

  declare profileId: number | null;

  declare emailVerifiedAt: Date | null;

  declare termsAcceptedAt: Date | null;

  declare lastLoginAt: Date | null;

  declare createdAt: Date;

  declare updatedAt: Date;

  declare deletedAt: Date | null;
  declare identityDisabledAt: Date | null;
}

UserModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },

    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      set(value: string) {
        this.setDataValue('email', value.trim().toLowerCase());
      },
    },

    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'PLAYER',
    },

    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },

    profileId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    emailVerifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    termsAcceptedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    lastLoginAt: {
      type: DataTypes.DATE,
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

    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    identityDisabledAt: { type: DataTypes.DATE, allowNull: true },
  },

  {
    sequelize,

    tableName: 'users',

    modelName: 'User',

    timestamps: true,

    paranoid: true,

    indexes: [
      {
        unique: true,
        fields: ['email'],
      },

      {
        unique: true,
        fields: ['phone'],
      },

      {
        fields: ['status'],
      },

      {
        fields: ['type'],
      },

      {
        fields: ['profileId'],
      },

      {
        fields: ['emailVerifiedAt'],
      },
    ],
  },
);
