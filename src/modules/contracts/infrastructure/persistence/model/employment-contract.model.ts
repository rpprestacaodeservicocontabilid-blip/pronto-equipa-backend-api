import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import { EmploymentContractProps } from '../../../domain/aggregates/employment-contract.aggregate';

type ContractAttributes = EmploymentContractProps & {
  createdAt: Date;
  updatedAt: Date;
};

export class EmploymentContractModel
  extends Model<ContractAttributes, Optional<ContractAttributes, 'createdAt' | 'updatedAt'>>
  implements ContractAttributes
{
  declare id: string;
  declare companyId: number;
  declare employeeId: string;
  declare contractNumber: string;
  declare typeCode: string;
  declare legalRuleVersionId: string | null;
  declare status: EmploymentContractProps['status'];
  declare startDate: string;
  declare endDate: string | null;
  declare currency: string;
  declare salaryAmount: string | null;
  declare terms: Record<string, unknown>;
  declare version: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

EmploymentContractModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    contractNumber: { type: DataTypes.STRING(50), allowNull: false },
    typeCode: { type: DataTypes.STRING(50), allowNull: false },
    legalRuleVersionId: { type: DataTypes.STRING(120), allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    salaryAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    terms: { type: DataTypes.JSON, allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'employment_contracts',
    indexes: [
      { unique: true, fields: ['companyId', 'contractNumber'], name: 'uq_contract_company_number' },
      { fields: ['companyId', 'employeeId', 'status'], name: 'idx_contract_employee_status' },
      { fields: ['companyId', 'status', 'endDate'], name: 'idx_contract_expiring' },
    ],
  },
);
