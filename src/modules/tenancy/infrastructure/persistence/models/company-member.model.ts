import { DataTypes, Model, Optional } from 'sequelize';

import { sequelize } from '../../../../../infra/database/index';

export interface CompanyMemberModelAttributes {
  id: number;
  companyId: number;
  userId: number;
  roleId: number;
  status: string;
  invitedBy: number | null;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyMemberModelCreationAttributes extends Optional<
  CompanyMemberModelAttributes,
  'id' | 'status' | 'invitedBy' | 'joinedAt' | 'createdAt' | 'updatedAt'
> {}

export class CompanyMemberModel
  extends Model<CompanyMemberModelAttributes, CompanyMemberModelCreationAttributes>
  implements CompanyMemberModelAttributes
{
  declare id: number;

  declare companyId: number;
  declare userId: number;
  declare roleId: number;

  declare status: string;

  declare invitedBy: number | null;
  declare joinedAt: Date | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}

CompanyMemberModel.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    companyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },

    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },

    roleId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },

    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },

    invitedBy: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },

    joinedAt: {
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
    tableName: 'company_members',
    modelName: 'CompanyMember',
    timestamps: true,

    indexes: [
      {
        unique: true,
        fields: ['companyId', 'userId'],
      },
      {
        fields: ['companyId', 'status'],
      },
      {
        fields: ['userId'],
      },
    ],
  },
);
