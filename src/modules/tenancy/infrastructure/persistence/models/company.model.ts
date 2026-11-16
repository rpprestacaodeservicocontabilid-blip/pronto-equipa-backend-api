import { DataTypes, Model, Optional } from 'sequelize';

import { sequelize } from '../../../../../infra/database/index';

export interface CompanyModelAttributes {
  id: number;
  name: string;
  slug: string;
  nif: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  timezone: string;
  locale: string;
  settings: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyModelCreationAttributes extends Optional<
  CompanyModelAttributes,
  'id' | 'nif' | 'email' | 'phone' | 'settings' | 'createdAt' | 'updatedAt'
> {}

export class CompanyModel
  extends Model<CompanyModelAttributes, CompanyModelCreationAttributes>
  implements CompanyModelAttributes
{
  declare id: number;

  declare name: string;
  declare slug: string;

  declare nif: string | null;
  declare email: string | null;
  declare phone: string | null;

  declare status: string;

  declare timezone: string;
  declare locale: string;

  declare settings: Record<string, unknown> | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}

CompanyModel.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },

    slug: {
      type: DataTypes.STRING(160),
      allowNull: false,
      unique: true,
    },

    nif: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },

    timezone: {
      type: DataTypes.STRING(60),
      allowNull: false,
      defaultValue: 'Africa/Luanda',
    },

    locale: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'pt-AO',
    },

    settings: {
      type: DataTypes.JSON,
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
    tableName: 'companies',
    modelName: 'Company',
    timestamps: true,

    indexes: [
      {
        unique: true,
        fields: ['slug'],
      },
      {
        fields: ['status'],
      },
    ],
  },
);
