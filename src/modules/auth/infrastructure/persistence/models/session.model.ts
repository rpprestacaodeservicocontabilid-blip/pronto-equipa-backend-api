import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';

import { sequelize } from '../../../../../infra/database/index';

export class SessionModel extends Model<
  InferAttributes<SessionModel>,
  InferCreationAttributes<SessionModel>
> {
  declare id: CreationOptional<number>;

  declare authAccountId: number;

  declare refreshTokenId: number | null;

  declare status: string;

  declare ipAddress: string | null;

  declare userAgent: string | null;

  declare deviceId: string | null;

  declare expiresAt: Date;

  declare lastActivityAt: Date | null;

  declare revokedAt: Date | null;

  declare createdAt: Date;

  declare updatedAt: Date;
}

SessionModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    authAccountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    refreshTokenId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },

    ipAddress: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    deviceId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    lastActivityAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    revokedAt: {
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
  },
  {
    sequelize,
    tableName: 'auth_sessions',
    timestamps: true,
    indexes: [
      {
        fields: ['authAccountId'],
      },
      {
        fields: ['status'],
      },
      {
        fields: ['expiresAt'],
      },
    ],
  },
);
