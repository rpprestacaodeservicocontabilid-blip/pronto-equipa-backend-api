import { DataTypes, Model, Optional } from 'sequelize';

import { sequelize } from '../../../../../infra/database/index';

export interface AuditLogModelAttributes {
  id: number;
  companyId: number | null;
  actorUserId: number | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface AuditLogModelCreationAttributes extends Optional<
  AuditLogModelAttributes,
  'id' | 'companyId' | 'actorUserId' | 'entityId' | 'before' | 'after' | 'ipAddress' | 'userAgent'
> {}

export class AuditLogModel
  extends Model<AuditLogModelAttributes, AuditLogModelCreationAttributes>
  implements AuditLogModelAttributes
{
  declare id: number;
  declare companyId: number | null;
  declare actorUserId: number | null;
  declare action: string;
  declare entityType: string;
  declare entityId: string | null;
  declare before: Record<string, unknown> | null;
  declare after: Record<string, unknown> | null;
  declare ipAddress: string | null;
  declare userAgent: string | null;
  declare createdAt: Date;
}

AuditLogModel.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    companyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },

    actorUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },

    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    entityType: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    entityId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    before: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    after: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    ipAddress: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },

    userAgent: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },

    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'audit_logs',
    timestamps: true,
    // Registos imutáveis: sem coluna `updatedAt`.
    updatedAt: false,

    indexes: [
      {
        fields: ['companyId', 'createdAt'],
      },
      {
        fields: ['entityType', 'entityId'],
      },
      {
        fields: ['actorUserId'],
      },
      {
        fields: ['action'],
      },
    ],
  },
);
