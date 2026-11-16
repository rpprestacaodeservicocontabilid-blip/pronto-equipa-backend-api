type VersionInput = {
  componentType: string;
  calculationMethod: string;
  frequency: string;
  currency: string;
  legalClassificationRef?: string;
  effectiveFrom: string;
  calculationConfig: Record<string, unknown>;
};
type StructureItemInput = {
  componentVersionId: string;
  amount?: string;
  percentage?: string;
  calculationConfig: Record<string, unknown>;
  required: boolean;
};
type AssignmentInput = {
  employeeId: string;
  contractId: string;
  structureVersionId: string;
  effectiveFrom: string;
  baseSalary: string;
  currency: string;
  components: Array<{
    componentVersionId: string;
    amount?: string;
    sourceReference?: string;
    calculationConfig: Record<string, unknown>;
  }>;
};
type RevisionInput = {
  employeeId: string;
  previousAssignmentId: string;
  effectiveFrom: string;
  reason: string;
  proposedData: Omit<AssignmentInput, 'employeeId' | 'contractId' | 'effectiveFrom'>;
};
type PolicyInput = { code: string; effectiveFrom: string; rules: Record<string, unknown> };
type BatchInput = {
  code: string;
  effectiveFrom: string;
  reason: string;
  idempotencyKey: string;
  items: Array<Omit<AssignmentInput, 'contractId' | 'effectiveFrom'> & { employeeId: string }>;
};
type SimulationInput = {
  baseSalary: string;
  currency: string;
  effectiveDate?: string;
  structureVersionId?: string;
  components: AssignmentInput['components'];
};
/** Operation inputs and opaque read results; no ORM types cross this boundary. */
export interface SalaryStructureRepositoryPort {
  listComponents(
    companyId: number,
    query: {
      page: number;
      limit: number;
      status?: string;
      code?: string;
    },
  ): Promise<{
    data: Array<{ id: string; code: string }>;
    total: number;
    page: number;
    limit: number;
  }>;
  getComponent(companyId: number, id: string): Promise<object>;
  createComponent(
    companyId: number,
    actorUserId: number,
    input: VersionInput & {
      code: string;
      name: string;
      description?: string;
    },
  ): Promise<object>;
  updateComponent(
    companyId: number,
    id: string,
    input: {
      name?: string;
      description?: string | null;
    },
  ): Promise<object>;
  createComponentVersion(
    companyId: number,
    actorUserId: number,
    id: string,
    input: VersionInput,
  ): Promise<object>;
  publishComponentVersion(
    companyId: number,
    actorUserId: number,
    componentId: string,
    versionId: string,
  ): Promise<object>;
  deactivateComponent(companyId: number, id: string): Promise<object>;
  listTables(
    companyId: number,
    query: {
      page: number;
      limit: number;
      status?: string;
    },
  ): Promise<object>;
  createTable(
    companyId: number,
    actorUserId: number,
    input: {
      code: string;
      name: string;
      effectiveFrom: string;
    },
  ): Promise<object>;
  createTableVersion(
    companyId: number,
    actorUserId: number,
    tableId: string,
    effectiveFrom: string,
  ): Promise<object>;
  addGrade(
    companyId: number,
    tableId: string,
    input: {
      code: string;
      name: string;
      minAmount: string;
      maxAmount: string;
      currency: string;
      functionCode?: string;
      categoryCode?: string;
    },
  ): Promise<object>;
  addStep(
    companyId: number,
    gradeId: string,
    input: {
      code: string;
      name: string;
      amount: string;
      currency: string;
    },
  ): Promise<object>;
  publishTableVersion(
    companyId: number,
    actorUserId: number,
    tableId: string,
    versionId: string,
  ): Promise<object>;
  getTable(companyId: number, id: string): Promise<object>;
  listStructures(
    companyId: number,
    query: {
      page: number;
      limit: number;
      status?: string;
    },
  ): Promise<object>;
  createStructure(
    companyId: number,
    actorUserId: number,
    input: {
      code: string;
      name: string;
      effectiveFrom: string;
      items: StructureItemInput[];
    },
  ): Promise<object>;
  getStructure(companyId: number, id: string): Promise<object>;
  createStructureVersion(
    companyId: number,
    actorUserId: number,
    structureId: string,
    input: {
      effectiveFrom: string;
      items: StructureItemInput[];
    },
  ): Promise<object>;
  submitStructure(companyId: number, id: string): Promise<object>;
  decideStructure(
    companyId: number,
    actorUserId: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
  ): Promise<object>;
  publishStructure(companyId: number, actorUserId: number, id: string): Promise<object>;
  createAssignment(companyId: number, actorUserId: number, input: AssignmentInput): Promise<object>;
  listAssignments(
    companyId: number,
    query: {
      page: number;
      limit: number;
      employeeId?: string;
      status?: string;
    },
  ): Promise<{ data: unknown[]; total: number; page: number; limit: number }>;
  getAssignment(companyId: number, id: string): Promise<object>;
  currentSalary(companyId: number, employeeId: string, effectiveDate?: string): Promise<object>;
  assignmentHistory(companyId: number, employeeId: string): Promise<object>;
  resolveSnapshot(companyId: number, employeeId: string, effectiveDate: string): Promise<object>;
  createRevision(companyId: number, actorUserId: number, input: RevisionInput): Promise<object>;
  listRevisions(
    companyId: number,
    query: {
      page: number;
      limit: number;
      status?: string;
      employeeId?: string;
    },
  ): Promise<object>;
  getRevision(companyId: number, id: string): Promise<object>;
  submitRevision(companyId: number, id: string): Promise<object>;
  decideRevision(
    companyId: number,
    actorUserId: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string,
  ): Promise<object>;
  applyRevision(
    companyId: number,
    actorUserId: number,
    id: string,
    idempotencyKey: string,
  ): Promise<object>;
  createRevisionBatch(companyId: number, actorUserId: number, input: BatchInput): Promise<object>;
  getRevisionBatch(companyId: number, id: string): Promise<object>;
  validateRevisionBatch(companyId: number, id: string): Promise<object>;
  approveRevisionBatch(companyId: number, actorUserId: number, id: string): Promise<object>;
  applyRevisionBatch(companyId: number, actorUserId: number, id: string): Promise<object>;
  createPolicy(companyId: number, actorUserId: number, input: PolicyInput): Promise<object>;
  listPolicies(companyId: number): Promise<object>;
  simulate(companyId: number, input: SimulationInput): Promise<object>;
  report(
    companyId: number,
    report: 'components' | 'structures' | 'revisions',
    query: {
      page: number;
      limit: number;
    },
  ): Promise<object>;
  requestExport(
    companyId: number,
    actorUserId: number,
    report: string,
    format: string,
    filters: Record<string, unknown>,
  ): Promise<object>;
  currentSalaryReport(
    companyId: number,
    employeeId: string,
    effectiveDate?: string,
  ): Promise<object>;
}
