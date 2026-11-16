import { DataTypes, Model, ModelStatic } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

// Same extensible-record persistence pattern used by attendance. Monetary results
// remain in payroll_employee_results with DECIMAL columns.
export interface WorkflowRecord {
  id: string;
  companyId: number;
  runId: string | null;
  employeeId: string | null;
  status: string;
  version: number;
  key: string;
  data: Record<string, unknown>;
}
export class WorkflowModel extends Model<WorkflowRecord> {
  declare id: string;
  declare companyId: number;
  declare runId: string | null;
  declare employeeId: string | null;
  declare status: string;
  declare version: number;
  declare key: string;
  declare data: Record<string, unknown>;
}
const define = (tableName: string): ModelStatic<WorkflowModel> => {
  class RecordModel extends WorkflowModel {}
  RecordModel.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true },
      companyId: { type: DataTypes.INTEGER, allowNull: false },
      runId: { type: DataTypes.UUID, allowNull: true },
      employeeId: { type: DataTypes.UUID, allowNull: true },
      status: { type: DataTypes.STRING(40), allowNull: false },
      version: { type: DataTypes.INTEGER, allowNull: false },
      key: { type: DataTypes.STRING(200), allowNull: false },
      data: { type: DataTypes.JSON, allowNull: false },
    },
    {
      sequelize,
      tableName,
      modelName: tableName,
      indexes: [
        { unique: true, fields: ['companyId', 'key'] },
        { fields: ['companyId', 'runId', 'status'] },
      ],
    },
  );
  return RecordModel;
};
export const PayrollBatch = define('payroll_batches');
export const PayrollItem = define('payroll_batch_items');
export const PayrollIssue = define('payroll_validation_issues');
export const PayrollApproval = define('payroll_approvals');
export const PayrollClosing = define('payroll_closings');
export const PayrollAdjustment = define('payroll_adjustments');
export const PayrollInstruction = define('payroll_payment_instructions');
export const PayrollPolicy = define('payroll_policies');
export const PayrollLine = define('payroll_result_lines');
export const PayrollCalculation = define('payroll_calculation_snapshots');
export const PayrollExport = define('payroll_exports');
export const PAYROLL_WORKFLOW_MODELS = [
  PayrollBatch,
  PayrollItem,
  PayrollIssue,
  PayrollApproval,
  PayrollClosing,
  PayrollAdjustment,
  PayrollInstruction,
  PayrollPolicy,
  PayrollLine,
  PayrollCalculation,
  PayrollExport,
];
