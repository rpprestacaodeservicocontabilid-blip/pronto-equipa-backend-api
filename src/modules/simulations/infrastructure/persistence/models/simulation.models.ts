import { DataTypes, Model, ModelStatic } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

export class SimulationRecordModel extends Model {
  declare id: string;
  declare companyId: number;
  declare status: string;
  declare runId: string | null;
  declare employeeId: string | null;
  declare key: string;
  declare version: number;
  declare data: Record<string, unknown>;
  declare createdAt: Date;
  declare updatedAt: Date;
}
const define = (tableName: string, uniqueKey = true): ModelStatic<SimulationRecordModel> => {
  class RecordModel extends SimulationRecordModel {}
  RecordModel.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      status: { type: DataTypes.STRING(40), allowNull: false },
      runId: { type: DataTypes.UUID, allowNull: true },
      employeeId: { type: DataTypes.UUID, allowNull: true },
      key: { type: DataTypes.STRING(200), allowNull: false },
      version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      data: { type: DataTypes.JSON, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName,
      modelName: tableName,
      indexes: [
        ...(uniqueKey ? [{ unique: true, fields: ['companyId', 'key'] }] : []),
        { fields: ['companyId', 'runId', 'status'] },
        { fields: ['companyId', 'employeeId', 'status'] },
      ],
    },
  );
  return RecordModel;
};
export const SimulationScenarioModel = define('simulation_scenarios');
export const SimulationScenarioVersionModel = define('simulation_scenario_versions');
export const SimulationRunModel = define('simulation_runs');
export const SimulationRunItemModel = define('simulation_run_items');
export const SimulationComparisonModel = define('simulation_comparisons');
export const SimulationProposalModel = define('simulation_proposals');
export const SimulationApprovalModel = define('simulation_approvals');
export const SimulationProjectionModel = define('simulation_projections');
export const SimulationExportModel = define('simulation_exports');
export const SimulationIssueModel = define('simulation_issues', false);
export const SimulationPolicyModel = define('simulation_policies');
export const SimulationOutboxModel = define('simulation_outbox', false);
export const SIMULATION_MODELS: ModelStatic<SimulationRecordModel>[] = [
  SimulationScenarioModel,
  SimulationScenarioVersionModel,
  SimulationRunModel,
  SimulationRunItemModel,
  SimulationComparisonModel,
  SimulationProposalModel,
  SimulationApprovalModel,
  SimulationProjectionModel,
  SimulationExportModel,
  SimulationIssueModel,
  SimulationPolicyModel,
  SimulationOutboxModel,
];
