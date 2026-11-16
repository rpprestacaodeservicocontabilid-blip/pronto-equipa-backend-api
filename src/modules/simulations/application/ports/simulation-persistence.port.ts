import {
  RecordStorePort,
  RecordStoreContext,
} from '../../../../shared/application/ports/record-store.port';
export interface SimulationRecord {
  id: string;
  companyId: number;
  status: string;
  runId: string | null;
  employeeId: string | null;
  key: string;
  version: number;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
export type SimulationCollection =
  | 'simulationApproval'
  | 'simulationComparison'
  | 'simulationExport'
  | 'simulationIssue'
  | 'simulationProposal'
  | 'simulationProjection'
  | 'simulationRunItem'
  | 'simulationRun'
  | 'simulationScenario'
  | 'simulationScenarioVersion';
export interface SimulationPersistencePort {
  collections: Record<SimulationCollection, RecordStorePort<SimulationRecord>>;
  update(
    record: SimulationRecord,
    changes: Partial<SimulationRecord>,
    options?: { transaction?: RecordStoreContext },
  ): Promise<SimulationRecord>;
}
export interface SimulationExportRendererPort {
  pdf(rows: string[][]): Buffer;
  xlsx(rows: string[][]): Buffer;
}
