import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

type Timestamped = { createdAt: Date; updatedAt: Date };

interface SalaryComponentAttributes extends Timestamped {
  id: string;
  companyId: number;
  code: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  createdBy: number;
}

export class SalaryComponentModel
  extends Model<
    SalaryComponentAttributes,
    Optional<
      SalaryComponentAttributes,
      'id' | 'description' | 'status' | 'version' | 'createdAt' | 'updatedAt'
    >
  >
  implements SalaryComponentAttributes
{
  declare id: string;
  declare companyId: number;
  declare code: string;
  declare name: string;
  declare description: string | null;
  declare status: 'ACTIVE' | 'INACTIVE';
  declare version: number;
  declare createdBy: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

SalaryComponentModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    code: { type: DataTypes.STRING(50), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    description: { type: DataTypes.STRING(1000), allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'salary_components',
    timestamps: false,
    indexes: [{ unique: true, fields: ['companyId', 'code'], name: 'uq_salary_component_code' }],
  },
);

interface SalaryComponentVersionAttributes {
  id: string;
  companyId: number;
  componentId: string;
  version: number;
  componentType: string;
  calculationMethod: string;
  frequency: string;
  currency: string;
  legalClassificationRef: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  calculationConfig: Record<string, unknown>;
  status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  createdBy: number;
  createdAt: Date;
}

export class SalaryComponentVersionModel
  extends Model<
    SalaryComponentVersionAttributes,
    Optional<SalaryComponentVersionAttributes, 'id' | 'effectiveTo' | 'createdAt'>
  >
  implements SalaryComponentVersionAttributes
{
  declare id: string;
  declare companyId: number;
  declare componentId: string;
  declare version: number;
  declare componentType: string;
  declare calculationMethod: string;
  declare frequency: string;
  declare currency: string;
  declare legalClassificationRef: string | null;
  declare effectiveFrom: string;
  declare effectiveTo: string | null;
  declare calculationConfig: Record<string, unknown>;
  declare status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  declare createdBy: number;
  declare createdAt: Date;
}

SalaryComponentVersionModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    componentId: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    componentType: { type: DataTypes.STRING(40), allowNull: false },
    calculationMethod: { type: DataTypes.STRING(40), allowNull: false },
    frequency: { type: DataTypes.STRING(30), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    legalClassificationRef: { type: DataTypes.STRING(120), allowNull: true },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    calculationConfig: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'DRAFT' },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'salary_component_versions',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'componentId', 'version'],
        name: 'uq_salary_component_version',
      },
    ],
  },
);

interface SalaryTableAttributes extends Timestamped {
  id: string;
  companyId: number;
  code: string;
  name: string;
  status: string;
  version: number;
  createdBy: number;
}
export class SalaryTableModel
  extends Model<
    SalaryTableAttributes,
    Optional<SalaryTableAttributes, 'id' | 'status' | 'version' | 'createdAt' | 'updatedAt'>
  >
  implements SalaryTableAttributes
{
  declare id: string;
  declare companyId: number;
  declare code: string;
  declare name: string;
  declare status: string;
  declare version: number;
  declare createdBy: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}
SalaryTableModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    code: { type: DataTypes.STRING(50), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'salary_tables',
    timestamps: false,
    indexes: [{ unique: true, fields: ['companyId', 'code'], name: 'uq_salary_table_code' }],
  },
);

interface SalaryTableVersionAttributes {
  id: string;
  companyId: number;
  tableId: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  createdBy: number;
  createdAt: Date;
}
export class SalaryTableVersionModel
  extends Model<
    SalaryTableVersionAttributes,
    Optional<SalaryTableVersionAttributes, 'id' | 'effectiveTo' | 'createdAt'>
  >
  implements SalaryTableVersionAttributes
{
  declare id: string;
  declare companyId: number;
  declare tableId: string;
  declare version: number;
  declare effectiveFrom: string;
  declare effectiveTo: string | null;
  declare status: string;
  declare createdBy: number;
  declare createdAt: Date;
}
SalaryTableVersionModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    tableId: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'DRAFT' },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'salary_table_versions',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'tableId', 'version'],
        name: 'uq_salary_table_version',
      },
    ],
  },
);

interface SalaryGradeAttributes {
  id: string;
  companyId: number;
  tableVersionId: string;
  code: string;
  name: string;
  minAmount: string;
  maxAmount: string;
  currency: string;
  functionCode: string | null;
  categoryCode: string | null;
  createdAt: Date;
}
export class SalaryGradeModel
  extends Model<
    SalaryGradeAttributes,
    Optional<SalaryGradeAttributes, 'id' | 'functionCode' | 'categoryCode' | 'createdAt'>
  >
  implements SalaryGradeAttributes
{
  declare id: string;
  declare companyId: number;
  declare tableVersionId: string;
  declare code: string;
  declare name: string;
  declare minAmount: string;
  declare maxAmount: string;
  declare currency: string;
  declare functionCode: string | null;
  declare categoryCode: string | null;
  declare createdAt: Date;
}
SalaryGradeModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    tableVersionId: { type: DataTypes.UUID, allowNull: false },
    code: { type: DataTypes.STRING(50), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    minAmount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    maxAmount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    functionCode: { type: DataTypes.STRING(100), allowNull: true },
    categoryCode: { type: DataTypes.STRING(100), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'salary_grades',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'tableVersionId', 'code'],
        name: 'uq_salary_grade_code',
      },
    ],
  },
);

interface SalaryStepAttributes {
  id: string;
  companyId: number;
  gradeId: string;
  code: string;
  name: string;
  amount: string;
  currency: string;
  createdAt: Date;
}
export class SalaryStepModel
  extends Model<SalaryStepAttributes, Optional<SalaryStepAttributes, 'id' | 'createdAt'>>
  implements SalaryStepAttributes
{
  declare id: string;
  declare companyId: number;
  declare gradeId: string;
  declare code: string;
  declare name: string;
  declare amount: string;
  declare currency: string;
  declare createdAt: Date;
}
SalaryStepModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    gradeId: { type: DataTypes.UUID, allowNull: false },
    code: { type: DataTypes.STRING(50), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'salary_steps',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['companyId', 'gradeId', 'code'], name: 'uq_salary_step_code' },
    ],
  },
);

interface SalaryStructureAttributes extends Timestamped {
  id: string;
  companyId: number;
  code: string;
  name: string;
  status: string;
  version: number;
  createdBy: number;
}
export class SalaryStructureModel
  extends Model<
    SalaryStructureAttributes,
    Optional<SalaryStructureAttributes, 'id' | 'status' | 'version' | 'createdAt' | 'updatedAt'>
  >
  implements SalaryStructureAttributes
{
  declare id: string;
  declare companyId: number;
  declare code: string;
  declare name: string;
  declare status: string;
  declare version: number;
  declare createdBy: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}
SalaryStructureModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    code: { type: DataTypes.STRING(50), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'salary_structures',
    timestamps: false,
    indexes: [{ unique: true, fields: ['companyId', 'code'], name: 'uq_salary_structure_code' }],
  },
);

interface SalaryStructureVersionAttributes {
  id: string;
  companyId: number;
  structureId: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  approvedBy: number | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  createdBy: number;
  createdAt: Date;
}
export class SalaryStructureVersionModel
  extends Model<
    SalaryStructureVersionAttributes,
    Optional<
      SalaryStructureVersionAttributes,
      'id' | 'effectiveTo' | 'approvedBy' | 'approvedAt' | 'publishedAt' | 'createdAt'
    >
  >
  implements SalaryStructureVersionAttributes
{
  declare id: string;
  declare companyId: number;
  declare structureId: string;
  declare version: number;
  declare effectiveFrom: string;
  declare effectiveTo: string | null;
  declare status: string;
  declare approvedBy: number | null;
  declare approvedAt: Date | null;
  declare publishedAt: Date | null;
  declare createdBy: number;
  declare createdAt: Date;
}
SalaryStructureVersionModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    structureId: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'DRAFT' },
    approvedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'salary_structure_versions',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'structureId', 'version'],
        name: 'uq_salary_structure_version',
      },
    ],
  },
);

interface SalaryStructureItemAttributes {
  id: string;
  companyId: number;
  structureVersionId: string;
  componentVersionId: string;
  amount: string | null;
  percentage: string | null;
  calculationConfig: Record<string, unknown>;
  required: boolean;
  createdAt: Date;
}
export class SalaryStructureItemModel
  extends Model<
    SalaryStructureItemAttributes,
    Optional<SalaryStructureItemAttributes, 'id' | 'createdAt'>
  >
  implements SalaryStructureItemAttributes
{
  declare id: string;
  declare companyId: number;
  declare structureVersionId: string;
  declare componentVersionId: string;
  declare amount: string | null;
  declare percentage: string | null;
  declare calculationConfig: Record<string, unknown>;
  declare required: boolean;
  declare createdAt: Date;
}
SalaryStructureItemModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    structureVersionId: { type: DataTypes.UUID, allowNull: false },
    componentVersionId: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    percentage: { type: DataTypes.DECIMAL(7, 4), allowNull: true },
    calculationConfig: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'salary_structure_items',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'structureVersionId', 'componentVersionId'],
        name: 'uq_salary_structure_item',
      },
    ],
  },
);

interface SalaryAssignmentAttributes extends Timestamped {
  id: string;
  companyId: number;
  employeeId: string;
  contractId: string;
  structureVersionId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  baseSalary: string;
  currency: string;
  status: string;
  version: number;
  createdBy: number;
  sourceRevisionId: string | null;
}
export class EmployeeSalaryAssignmentModel
  extends Model<
    SalaryAssignmentAttributes,
    Optional<
      SalaryAssignmentAttributes,
      | 'id'
      | 'structureVersionId'
      | 'effectiveTo'
      | 'status'
      | 'version'
      | 'createdAt'
      | 'updatedAt'
      | 'sourceRevisionId'
    >
  >
  implements SalaryAssignmentAttributes
{
  declare id: string;
  declare companyId: number;
  declare employeeId: string;
  declare contractId: string;
  declare structureVersionId: string | null;
  declare effectiveFrom: string;
  declare effectiveTo: string | null;
  declare baseSalary: string;
  declare currency: string;
  declare status: string;
  declare version: number;
  declare createdBy: number;
  declare sourceRevisionId: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}
EmployeeSalaryAssignmentModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    contractId: { type: DataTypes.UUID, allowNull: false },
    structureVersionId: { type: DataTypes.UUID, allowNull: true },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    baseSalary: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    sourceRevisionId: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'employee_salary_assignments',
    timestamps: false,
    indexes: [
      {
        fields: ['companyId', 'employeeId', 'effectiveFrom', 'effectiveTo'],
        name: 'idx_salary_assignment_effective',
      },
    ],
  },
);

interface EmployeeSalaryComponentAttributes {
  id: string;
  companyId: number;
  assignmentId: string;
  componentVersionId: string;
  amount: string | null;
  calculationConfig: Record<string, unknown>;
  sourceReference: string | null;
  createdAt: Date;
}
export class EmployeeSalaryComponentModel
  extends Model<
    EmployeeSalaryComponentAttributes,
    Optional<EmployeeSalaryComponentAttributes, 'id' | 'amount' | 'sourceReference' | 'createdAt'>
  >
  implements EmployeeSalaryComponentAttributes
{
  declare id: string;
  declare companyId: number;
  declare assignmentId: string;
  declare componentVersionId: string;
  declare amount: string | null;
  declare calculationConfig: Record<string, unknown>;
  declare sourceReference: string | null;
  declare createdAt: Date;
}
EmployeeSalaryComponentModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    assignmentId: { type: DataTypes.UUID, allowNull: false },
    componentVersionId: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    calculationConfig: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    sourceReference: { type: DataTypes.STRING(200), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'employee_salary_components',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'assignmentId', 'componentVersionId'],
        name: 'uq_salary_assignment_component',
      },
    ],
  },
);

interface SalaryRevisionAttributes extends Timestamped {
  id: string;
  companyId: number;
  employeeId: string;
  previousAssignmentId: string;
  proposedData: Record<string, unknown>;
  effectiveFrom: string;
  status: string;
  reason: string;
  requestedBy: number;
  decidedBy: number | null;
  decidedAt: Date | null;
  appliedAssignmentId: string | null;
  idempotencyKey: string | null;
}
export class SalaryRevisionModel
  extends Model<
    SalaryRevisionAttributes,
    Optional<
      SalaryRevisionAttributes,
      | 'id'
      | 'decidedBy'
      | 'decidedAt'
      | 'appliedAssignmentId'
      | 'idempotencyKey'
      | 'createdAt'
      | 'updatedAt'
    >
  >
  implements SalaryRevisionAttributes
{
  declare id: string;
  declare companyId: number;
  declare employeeId: string;
  declare previousAssignmentId: string;
  declare proposedData: Record<string, unknown>;
  declare effectiveFrom: string;
  declare status: string;
  declare reason: string;
  declare requestedBy: number;
  declare decidedBy: number | null;
  declare decidedAt: Date | null;
  declare appliedAssignmentId: string | null;
  declare idempotencyKey: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}
SalaryRevisionModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    previousAssignmentId: { type: DataTypes.UUID, allowNull: false },
    proposedData: { type: DataTypes.JSON, allowNull: false },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'DRAFT' },
    reason: { type: DataTypes.STRING(2000), allowNull: false },
    requestedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    decidedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: true },
    appliedAssignmentId: { type: DataTypes.UUID, allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(200), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'salary_revisions',
    timestamps: false,
    indexes: [
      { fields: ['companyId', 'employeeId', 'status'], name: 'idx_salary_revision_status' },
      {
        unique: true,
        fields: ['companyId', 'idempotencyKey'],
        name: 'uq_salary_revision_idempotency',
      },
    ],
  },
);

interface SalaryRevisionBatchAttributes extends Timestamped {
  id: string;
  companyId: number;
  code: string;
  status: string;
  effectiveFrom: string;
  reason: string;
  requestedBy: number;
  idempotencyKey: string;
  approvedBy: number | null;
  approvedAt: Date | null;
}
export class SalaryRevisionBatchModel
  extends Model<
    SalaryRevisionBatchAttributes,
    Optional<
      SalaryRevisionBatchAttributes,
      'id' | 'status' | 'approvedBy' | 'approvedAt' | 'createdAt' | 'updatedAt'
    >
  >
  implements SalaryRevisionBatchAttributes
{
  declare id: string;
  declare companyId: number;
  declare code: string;
  declare status: string;
  declare effectiveFrom: string;
  declare reason: string;
  declare requestedBy: number;
  declare idempotencyKey: string;
  declare approvedBy: number | null;
  declare approvedAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}
SalaryRevisionBatchModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    code: { type: DataTypes.STRING(50), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'DRAFT' },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.STRING(2000), allowNull: false },
    requestedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(200), allowNull: false },
    approvedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'salary_revision_batches',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['companyId', 'code'], name: 'uq_salary_revision_batch_code' },
      {
        unique: true,
        fields: ['companyId', 'idempotencyKey'],
        name: 'uq_salary_revision_batch_idempotency',
      },
    ],
  },
);

interface SalaryRevisionItemAttributes {
  id: string;
  companyId: number;
  batchId: string;
  employeeId: string;
  previousAssignmentId: string | null;
  proposedData: Record<string, unknown>;
  status: string;
  error: string | null;
  assignmentId: string | null;
  createdAt: Date;
}
export class SalaryRevisionItemModel
  extends Model<
    SalaryRevisionItemAttributes,
    Optional<
      SalaryRevisionItemAttributes,
      'id' | 'previousAssignmentId' | 'error' | 'assignmentId' | 'createdAt'
    >
  >
  implements SalaryRevisionItemAttributes
{
  declare id: string;
  declare companyId: number;
  declare batchId: string;
  declare employeeId: string;
  declare previousAssignmentId: string | null;
  declare proposedData: Record<string, unknown>;
  declare status: string;
  declare error: string | null;
  declare assignmentId: string | null;
  declare createdAt: Date;
}
SalaryRevisionItemModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    batchId: { type: DataTypes.UUID, allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    previousAssignmentId: { type: DataTypes.UUID, allowNull: true },
    proposedData: { type: DataTypes.JSON, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING' },
    error: { type: DataTypes.STRING(1000), allowNull: true },
    assignmentId: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'salary_revision_items',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'batchId', 'employeeId'],
        name: 'uq_salary_revision_batch_employee',
      },
    ],
  },
);

interface SalaryPolicyAttributes {
  id: string;
  companyId: number;
  code: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  rules: Record<string, unknown>;
  active: boolean;
  createdBy: number;
  createdAt: Date;
}
export class SalaryPolicyModel
  extends Model<
    SalaryPolicyAttributes,
    Optional<SalaryPolicyAttributes, 'id' | 'effectiveTo' | 'active' | 'createdAt'>
  >
  implements SalaryPolicyAttributes
{
  declare id: string;
  declare companyId: number;
  declare code: string;
  declare version: number;
  declare effectiveFrom: string;
  declare effectiveTo: string | null;
  declare rules: Record<string, unknown>;
  declare active: boolean;
  declare createdBy: number;
  declare createdAt: Date;
}
SalaryPolicyModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    code: { type: DataTypes.STRING(50), allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    rules: { type: DataTypes.JSON, allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'salary_policies',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['companyId', 'code', 'version'], name: 'uq_salary_policy_version' },
    ],
  },
);

interface SalarySnapshotAttributes {
  id: string;
  companyId: number;
  employeeId: string;
  effectiveDate: string;
  assignmentId: string;
  sourceVersions: Record<string, unknown>;
  resolvedComponents: Array<Record<string, unknown>>;
  createdAt: Date;
}
export class SalarySnapshotModel
  extends Model<SalarySnapshotAttributes, Optional<SalarySnapshotAttributes, 'id' | 'createdAt'>>
  implements SalarySnapshotAttributes
{
  declare id: string;
  declare companyId: number;
  declare employeeId: string;
  declare effectiveDate: string;
  declare assignmentId: string;
  declare sourceVersions: Record<string, unknown>;
  declare resolvedComponents: Array<Record<string, unknown>>;
  declare createdAt: Date;
}
SalarySnapshotModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    effectiveDate: { type: DataTypes.DATEONLY, allowNull: false },
    assignmentId: { type: DataTypes.UUID, allowNull: false },
    sourceVersions: { type: DataTypes.JSON, allowNull: false },
    resolvedComponents: { type: DataTypes.JSON, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'salary_snapshots',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'employeeId', 'effectiveDate', 'assignmentId'],
        name: 'uq_salary_snapshot_effective',
      },
    ],
  },
);

interface SalaryOutboxAttributes {
  id: number;
  companyId: number;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  publishedAt: Date | null;
}
export class SalaryOutboxModel
  extends Model<SalaryOutboxAttributes, Optional<SalaryOutboxAttributes, 'id' | 'publishedAt'>>
  implements SalaryOutboxAttributes
{
  declare id: number;
  declare companyId: number;
  declare aggregateId: string;
  declare eventType: string;
  declare payload: Record<string, unknown>;
  declare occurredAt: Date;
  declare publishedAt: Date | null;
}
SalaryOutboxModel.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    aggregateId: { type: DataTypes.UUID, allowNull: false },
    eventType: { type: DataTypes.STRING(100), allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: false },
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'salary_structure_outbox',
    timestamps: false,
    indexes: [{ fields: ['publishedAt', 'occurredAt'], name: 'idx_salary_outbox_pending' }],
  },
);
