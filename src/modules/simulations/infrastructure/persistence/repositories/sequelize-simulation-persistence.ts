import {
  SimulationPersistencePort,
  SimulationRecord,
  SimulationCollection,
} from '../../../application/ports/simulation-persistence.port';
import { SequelizeRecordCollections } from '../../../../../shared/infrastructure/persistence/sequelize-record-collections';
import {
  SimulationApprovalModel,
  SimulationComparisonModel,
  SimulationExportModel,
  SimulationIssueModel,
  SimulationProposalModel,
  SimulationProjectionModel,
  SimulationRunItemModel,
  SimulationRunModel,
  SimulationScenarioModel,
  SimulationScenarioVersionModel,
} from '../models/simulation.models';
export class SequelizeSimulationPersistence
  extends SequelizeRecordCollections<SimulationRecord, SimulationCollection>
  implements SimulationPersistencePort
{
  constructor() {
    super(
      {
        simulationApproval: SimulationApprovalModel,
        simulationComparison: SimulationComparisonModel,
        simulationExport: SimulationExportModel,
        simulationIssue: SimulationIssueModel,
        simulationProposal: SimulationProposalModel,
        simulationProjection: SimulationProjectionModel,
        simulationRunItem: SimulationRunItemModel,
        simulationRun: SimulationRunModel,
        simulationScenario: SimulationScenarioModel,
        simulationScenarioVersion: SimulationScenarioVersionModel,
      },
      'simulations',
    );
  }
}
