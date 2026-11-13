import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

export interface EmployeeAttributes {
  id: string;
  companyId: number;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  nationality: string | null;
  email: string | null;
  phone: string | null;
  admissionDate: Date;
  departmentId: number | null;
  jobTitle: string | null;
  jobCategory: string | null;
  status: string;
  terminationDate: Date | null;
  terminationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class EmployeeModel
  extends Model<
    EmployeeAttributes,
    Optional<
      EmployeeAttributes,
      'id' | 'status' | 'terminationDate' | 'terminationReason' | 'createdAt' | 'updatedAt'
    >
  >
  implements EmployeeAttributes
{
  declare id: string;
  declare companyId: number;
  declare employeeNumber: string;
  declare firstName: string;
  declare lastName: string;
  declare dateOfBirth: Date | null;
  declare nationality: string | null;
  declare email: string | null;
  declare phone: string | null;
  declare admissionDate: Date;
  declare departmentId: number | null;
  declare jobTitle: string | null;
  declare jobCategory: string | null;
  declare status: string;
  declare terminationDate: Date | null;
  declare terminationReason: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

EmployeeModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
    },
    employeeNumber: { type: DataTypes.STRING(50), allowNull: false },
    firstName: { type: DataTypes.STRING(100), allowNull: false },
    lastName: { type: DataTypes.STRING(100), allowNull: false },
    dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
    nationality: { type: DataTypes.STRING(80), allowNull: true },
    email: { type: DataTypes.STRING(255), allowNull: true },
    phone: { type: DataTypes.STRING(40), allowNull: true },
    admissionDate: { type: DataTypes.DATEONLY, allowNull: false },
    departmentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    jobTitle: { type: DataTypes.STRING(150), allowNull: true },
    jobCategory: { type: DataTypes.STRING(100), allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'ACTIVE' },
    terminationDate: { type: DataTypes.DATEONLY, allowNull: true },
    terminationReason: { type: DataTypes.STRING(500), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'employees',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'employeeNumber'],
        name: 'uq_employees_company_number',
      },
      { fields: ['companyId', 'status'], name: 'idx_employees_company_status' },
      { fields: ['companyId', 'lastName', 'firstName'], name: 'idx_employees_company_name' },
    ],
  },
);
