import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../../infra/database';
import { RunStatus, RunType } from '../domain/payroll';

export class PayrollPeriodModel extends Model {
  declare id: string;
  declare companyId: number;
  declare startDate: string;
  declare endDate: string;
  declare paymentDate: string;
  declare status: 'DRAFT' | 'OPEN' | 'CLOSED';
  declare version: number;
}
export class PayrollRunModel extends Model {
  declare id: string;
  declare companyId: number;
  declare periodId: string;
  declare runType: RunType;
  declare executionScope: 'INDIVIDUAL' | 'COLLECTIVE';
  declare employeeIds: string[];
  declare status: RunStatus;
  declare version: number;
  declare requestHash: string;
}
export class PayrollEmployeeResultModel extends Model {}
export class PayrollInputSnapshotModel extends Model {}
export class PayrollOutboxModel extends Model {}

const identity = () => ({
  id: { type: DataTypes.UUID, primaryKey: true },
  companyId: { type: DataTypes.INTEGER, allowNull: false },
});
const money = () => ({ type: DataTypes.DECIMAL(18, 2), allowNull: false });
PayrollPeriodModel.init(
  {
    ...identity(),
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    paymentDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    createdBy: { type: DataTypes.INTEGER, allowNull: false },
  },
  { sequelize, tableName: 'payroll_periods' },
);
PayrollRunModel.init(
  {
    ...identity(),
    periodId: { type: DataTypes.UUID, allowNull: false },
    runType: { type: DataTypes.STRING(30), allowNull: false },
    executionScope: { type: DataTypes.STRING(30), allowNull: false },
    employeeIds: { type: DataTypes.JSON, allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    createdBy: { type: DataTypes.INTEGER, allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(100), allowNull: false },
    requestHash: { type: DataTypes.STRING(64), allowNull: false },
    originalRunId: { type: DataTypes.UUID, allowNull: true },
    reason: { type: DataTypes.STRING(1000), allowNull: true },
  },
  {
    sequelize,
    tableName: 'payroll_runs',
    indexes: [{ unique: true, fields: ['companyId', 'idempotencyKey'] }],
  },
);
PayrollEmployeeResultModel.init(
  {
    ...identity(),
    runId: { type: DataTypes.UUID, allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    grossAmount: money(),
    deductionsAmount: money(),
    netAmount: money(),
    employerCostsAmount: money(),
    currency: { type: DataTypes.STRING(3), allowNull: false },
    calculationSnapshot: { type: DataTypes.JSON, allowNull: false },
  },
  {
    sequelize,
    tableName: 'payroll_employee_results',
    indexes: [{ unique: true, fields: ['companyId', 'runId', 'employeeId'] }],
  },
);
PayrollInputSnapshotModel.init(
  {
    ...identity(),
    runId: { type: DataTypes.UUID, allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    inputHash: { type: DataTypes.STRING(64), allowNull: false },
    snapshotData: { type: DataTypes.JSON, allowNull: false },
  },
  {
    sequelize,
    tableName: 'payroll_input_snapshots',
    updatedAt: false,
    indexes: [{ unique: true, fields: ['companyId', 'runId', 'employeeId'] }],
  },
);
PayrollOutboxModel.init(
  {
    ...identity(),
    aggregateId: { type: DataTypes.UUID, allowNull: false },
    eventType: { type: DataTypes.STRING(100), allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: false },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'payroll_outbox', updatedAt: false },
);
