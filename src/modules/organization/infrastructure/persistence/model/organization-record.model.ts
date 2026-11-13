import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import {
  OrganizationEntityType,
  OrganizationRecord,
} from '../../../domain/services/organization-validation.service';

type OrganizationRecordAttributes = OrganizationRecord & {
  employeeId: string | null;
  relatedId: string | null;
  percentage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class OrganizationRecordModel
  extends Model<
    OrganizationRecordAttributes,
    Optional<OrganizationRecordAttributes, 'createdAt' | 'updatedAt'>
  >
  implements OrganizationRecordAttributes
{
  declare id: string;
  declare companyId: number;
  declare type: OrganizationEntityType;
  declare code: string;
  declare name: string;
  declare status: 'ACTIVE' | 'INACTIVE';
  declare parentId: string | null;
  declare effectiveFrom: string | null;
  declare effectiveTo: string | null;
  declare employeeId: string | null;
  declare relatedId: string | null;
  declare percentage: string | null;
  declare version: number;
  declare data: Record<string, unknown>;
  declare createdAt: Date;
  declare updatedAt: Date;
}

OrganizationRecordModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    type: { type: DataTypes.STRING(40), allowNull: false },
    code: { type: DataTypes.STRING(50), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false },
    parentId: { type: DataTypes.UUID, allowNull: true },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: true },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    employeeId: { type: DataTypes.UUID, allowNull: true },
    relatedId: { type: DataTypes.UUID, allowNull: true },
    percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    data: { type: DataTypes.JSON, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'organization_records',
    indexes: [
      { unique: true, fields: ['companyId', 'type', 'code'], name: 'uq_org_company_type_code' },
      { fields: ['companyId', 'type', 'status'], name: 'idx_org_company_type_status' },
      { fields: ['companyId', 'type', 'parentId'], name: 'idx_org_company_parent' },
      {
        fields: ['companyId', 'employeeId', 'effectiveFrom', 'effectiveTo'],
        name: 'idx_org_employee_allocation_period',
      },
    ],
  },
);
