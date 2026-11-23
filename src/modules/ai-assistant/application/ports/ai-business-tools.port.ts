/**
 * Porta de acesso a dados de negócio de outros módulos
 * (secção 2.1 — regras de dependência).
 *
 * O módulo `ai-assistant/` NÃO importa entidades, repositórios ou
 * detalhes de infraestrutura de outros contextos: consulta este
 * contrato, implementado no composition root com as fachadas
 * públicas de cada módulo.
 *
 * Todas as operações são de LEITURA ou de PREPARAÇÃO — a escrita
 * efectiva acontece nos casos de uso oficiais (RN-AI-020).
 */
export interface AiEmployeeReference {
  id: string;
  employeeNumber: string;
  fullName: string;
  status: string;
  departmentName?: string | null;
  jobTitle?: string | null;
}

export interface AiLeaveBalance {
  employeeId: string;
  availableDays: number;
  usedDays: number;
  pendingDays: number;
}

export interface AiAttendanceSummary {
  employeeId: string;
  period: string;
  workedDays: number;
  absenceDays: number;
  lateArrivals: number;
}

export interface AiPayrollRunReference {
  id: string;
  period: string;
  status: string;
  employeeCount: number;
  grossTotal: number;
  currency: string;
}

export interface AiPayslipReference {
  id: string;
  period: string;
  employeeId: string;
  grossAmount: number;
  netAmount: number;
  currency: string;
}

export interface AiReportSummary {
  code: string;
  title: string;
  generatedAt: string;
  metrics: Array<{ label: string; value: string | number; unit?: string }>;
  notes?: string[];
}

export interface AiLegalRuleReference {
  id: string;
  code: string;
  version: number;
  status: string;
  effectiveFrom: string;
  summary: string;
}

export interface AiSupportKnowledgeArticle {
  id: string;
  title: string;
  summary: string;
  module: string;
  url?: string;
}

export interface AiPreparedDraft {
  kind: 'SIMULATION' | 'LEAVE_REQUEST' | 'TICKET' | 'EXPORT' | 'CONFIGURATION';
  referenceId: string;
  title: string;
  summary: string;
  requiresConfirmation: boolean;
}

export interface AiBusinessToolsPort {
  searchEmployees(input: {
    tenantId: number;
    actorId: number;
    query?: string;
    limit: number;
  }): Promise<AiEmployeeReference[]>;

  getEmployee(input: { tenantId: number; actorId: number; employeeId: string }): Promise<AiEmployeeReference | null>;

  getContract(input: {
    tenantId: number;
    actorId: number;
    employeeId: string;
  }): Promise<Record<string, unknown> | null>;

  getLeaveBalance(input: { tenantId: number; actorId: number; employeeId?: string }): Promise<AiLeaveBalance | null>;

  getAttendanceSummary(input: {
    tenantId: number;
    actorId: number;
    employeeId: string;
    period: string;
  }): Promise<AiAttendanceSummary | null>;

  getSalaryAssignment(input: {
    tenantId: number;
    actorId: number;
    employeeId: string;
  }): Promise<Record<string, unknown> | null>;

  getPayrollRun(input: { tenantId: number; actorId: number; runId?: string }): Promise<AiPayrollRunReference | null>;

  getPayslip(input: { tenantId: number; actorId: number; payslipId?: string }): Promise<AiPayslipReference | null>;

  getReportSummary(input: { tenantId: number; actorId: number; code: string }): Promise<AiReportSummary | null>;

  getPublishedLegalRules(input: { tenantId: number; actorId: number; limit: number }): Promise<AiLegalRuleReference[]>;

  searchDocuments(input: { tenantId: number; actorId: number; query: string; limit: number }): Promise<
    Array<{ id: string; title: string; classification: string; reference: string }>
  >;

  searchKnowledge(input: { tenantId: number; actorId: number; query: string; limit: number }): Promise<
    AiSupportKnowledgeArticle[]
  >;

  createSimulationDraft(input: {
    tenantId: number;
    actorId: number;
    scenario: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<AiPreparedDraft>;

  prepareLeaveRequest(input: {
    tenantId: number;
    actorId: number;
    employeeId: string;
    startDate: string;
    endDate: string;
    idempotencyKey: string;
  }): Promise<AiPreparedDraft>;

  prepareTicket(input: {
    tenantId: number;
    actorId: number;
    subject: string;
    description: string;
    idempotencyKey: string;
  }): Promise<AiPreparedDraft>;

  prepareExport(input: {
    tenantId: number;
    actorId: number;
    reportCode: string;
    format: string;
    idempotencyKey: string;
  }): Promise<AiPreparedDraft>;

  prepareConfiguration(input: {
    tenantId: number;
    actorId: number;
    changes: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<AiPreparedDraft>;
}
