import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

export class EmployeeProfileSectionModel extends Model {
  declare companyId: number;
  declare employeeId: string;
  declare section: string;
  declare content: object;
  declare version: number;
}

EmployeeProfileSectionModel.init({
  companyId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
  employeeId: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
  section: { type: DataTypes.STRING(32), allowNull: false, primaryKey: true },
  content: { type: DataTypes.JSON, allowNull: false },
  version: { type: DataTypes.INTEGER, allowNull: false },
}, { sequelize, tableName: 'employee_profile_sections', timestamps: true });

export type RegistrationState = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

export class EmployeeRegistrationModel extends Model {
  declare id: string;
  declare companyId: number;
  declare createdBy: number;
  declare reviewedBy: number | null;
  declare status: RegistrationState;
  declare version: number;
  declare content: Record<string, unknown>;
  declare decisionReason: string | null;
  declare updatedAt: Date;
}

EmployeeRegistrationModel.init({
  id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
  companyId: { type: DataTypes.INTEGER, allowNull: false },
  createdBy: { type: DataTypes.INTEGER, allowNull: false },
  reviewedBy: { type: DataTypes.INTEGER, allowNull: true },
  status: { type: DataTypes.STRING(20), allowNull: false },
  version: { type: DataTypes.INTEGER, allowNull: false },
  content: { type: DataTypes.JSON, allowNull: false },
  decisionReason: { type: DataTypes.STRING(500), allowNull: true },
}, { sequelize, tableName: 'employee_registrations', timestamps: true,
  indexes: [{ fields: ['companyId', 'status', 'updatedAt'] }] });
