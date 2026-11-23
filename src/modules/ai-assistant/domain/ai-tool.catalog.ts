import type { CreateAiToolDefinitionInput } from './aggregates/ai-tool-definition.aggregate';

/**
 * Catálogo canónico de ferramentas (secção 11, RF-AI-041 a RF-AI-044).
 *
 * O catálogo é a FONTE DE VERDADE das capacidades do assistente:
 *
 *  - é gravado em `PLATFORM` — nenhuma empresa redefini riscos ou
 *    permissões (RN-AI-016);
 *  - o risco vem da definição registada, nunca do modelo;
 *  - ferramentas de escrita têm sempre `requiresConfirmation` ou
 *    `requiresApproval` (invariante do agregado);
 *  - não existem ferramentas genéricas de execução arbitrária.
 */
export const AI_TOOL_CATALOG_VERSION = '1.0.0';

const objectSchema = (
  properties: Record<string, Record<string, unknown>>,
  required: string[] = [],
): Record<string, unknown> => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const STRING = { type: 'string' } as const;
const POSITIVE_INTEGER = { type: 'integer', minimum: 1 } as const;

export const AI_TOOL_CATALOG: readonly CreateAiToolDefinitionInput[] = [
  // ------------------------------------------------------------
  // LEITURA (READ_ONLY)
  // ------------------------------------------------------------
  {
    name: 'employees.search',
    description: 'Procura trabalhadores activos no âmbito do utilizador autenticado.',
    riskLevel: 'READ_ONLY',
    requiredPermissions: ['employees.read'],
    inputSchema: objectSchema({
      query: { type: 'string', maxLength: 120 },
      limit: POSITIVE_INTEGER,
    }),
    outputSchema: objectSchema({ items: { type: 'array' } }),
  },
  {
    name: 'employees.get',
    description: 'Devolve a ficha de referência de um trabalhador.',
    riskLevel: 'READ_ONLY',
    requiredPermissions: ['employees.read'],
    inputSchema: objectSchema({ employeeId: STRING }, ['employeeId']),
    outputSchema: objectSchema({ employee: { type: 'object' } }, ['employee']),
  },
  {
    name: 'contracts.get',
    description: 'Devolve o contrato de trabalho vigente de um trabalhador.',
    riskLevel: 'READ_ONLY',
    requiredPermissions: ['contracts.read'],
    inputSchema: objectSchema({ employeeId: STRING }, ['employeeId']),
    outputSchema: objectSchema({ contract: { type: 'object' } }),
  },
  {
    name: 'leave.getBalance',
    description: 'Devolve o saldo de férias disponível, usado e pendente.',
    riskLevel: 'READ_ONLY',
    requiredPermissions: ['leave.accounts.read'],
    inputSchema: objectSchema({ employeeId: STRING }),
    outputSchema: objectSchema({ balance: { type: 'object' } }),
  },
  {
    name: 'attendance.getSummary',
    description: 'Devolve o resumo de assiduidade de um trabalhador num período.',
    riskLevel: 'READ_ONLY',
    requiredPermissions: ['attendance.days.read'],
    inputSchema: objectSchema(
      { employeeId: STRING, period: { ...STRING, pattern: '^\\d{4}-(0[1-9]|1[0-2])$' } },
      ['employeeId', 'period'],
    ),
    outputSchema: objectSchema({ summary: { type: 'object' } }, ['summary']),
  },
  {
    name: 'salaryStructure.getAssignment',
    description:
      'Devolve a atribuição salarial vigente; os valores são apresentados apenas ao perfil autorizado.',
    riskLevel: 'READ_ONLY',
    requiredPermissions: ['salary-structure:read'],
    inputSchema: objectSchema({ employeeId: STRING }, ['employeeId']),
    outputSchema: objectSchema({ assignment: { type: 'object' } }),
  },
  {
    name: 'payroll.getRun',
    description: 'Devolve o processamento de salários mais recente ou o indicado.',
    riskLevel: 'READ_ONLY',
    requiredPermissions: ['payroll:read'],
    inputSchema: objectSchema({ runId: STRING }),
    outputSchema: objectSchema({ run: { type: 'object' } }),
  },
  {
    name: 'payslips.getOwn',
    description: 'Devolve o recibo de vencimento do próprio utilizador ou o indicado.',
    riskLevel: 'READ_ONLY',
    requiredPermissions: ['payslips:read'],
    inputSchema: objectSchema({ payslipId: STRING, employeeId: STRING }),
    outputSchema: objectSchema({ payslip: { type: 'object' } }),
  },
  {
    name: 'reports.getSummary',
    description: 'Devolve o resumo métrico de um relatório já gerado.',
    riskLevel: 'READ_ONLY',
    requiredPermissions: ['reports:read'],
    inputSchema: objectSchema({ code: STRING }, ['code']),
    outputSchema: objectSchema({ report: { type: 'object' } }, ['report']),
  },
  {
    name: 'legalRules.listPublished',
    description: 'Lista as regras legais publicadas e vigentes.',
    riskLevel: 'READ_ONLY',
    requiredPermissions: ['legal-rules:read'],
    inputSchema: objectSchema({ limit: POSITIVE_INTEGER }),
    outputSchema: objectSchema({ rules: { type: 'array' } }, ['rules']),
  },
  {
    name: 'documents.search',
    description: 'Pesquisa documentos que o utilizador já pode consultar.',
    riskLevel: 'READ_ONLY',
    requiredPermissions: ['documents:read'],
    inputSchema: objectSchema({ query: STRING, limit: POSITIVE_INTEGER }, ['query']),
    outputSchema: objectSchema({ items: { type: 'array' } }, ['items']),
  },
  {
    name: 'support.searchKnowledge',
    description: 'Pesquisa artigos de conhecimento publicados da equipa de suporte.',
    riskLevel: 'READ_ONLY',
    requiredPermissions: ['support:knowledge:read'],
    inputSchema: objectSchema({ query: STRING, limit: POSITIVE_INTEGER }, ['query']),
    outputSchema: objectSchema({ items: { type: 'array' } }, ['items']),
  },

  // ------------------------------------------------------------
  // ESCRITA DE BAIXO RISCO (confirmação do utilizador)
  // ------------------------------------------------------------
  {
    name: 'leave.createRequest',
    description:
      'Prepara um pedido de férias em rascunho; nada é submetido sem confirmação humana.',
    riskLevel: 'LOW',
    requiredPermissions: ['leave.requests.create', 'ai-assistant:tools:execute-write'],
    requiresConfirmation: true,
    requiresApproval: false,
    inputSchema: objectSchema(
      { employeeId: STRING, startDate: STRING, endDate: STRING },
      ['employeeId', 'startDate', 'endDate'],
    ),
    outputSchema: objectSchema({ draft: { type: 'object' } }, ['draft']),
  },
  {
    name: 'support.createTicket',
    description: 'Abre um ticket de suporte em rascunho após confirmação do utilizador.',
    riskLevel: 'LOW',
    requiredPermissions: ['support:tickets:create', 'ai-assistant:tools:execute-write'],
    requiresConfirmation: true,
    requiresApproval: false,
    inputSchema: objectSchema({ subject: STRING, description: STRING }, ['subject', 'description']),
    outputSchema: objectSchema({ draft: { type: 'object' } }, ['draft']),
  },
  {
    name: 'reports.export',
    description: 'Prepara a exportação de um relatório depois de confirmada pelo utilizador.',
    riskLevel: 'LOW',
    requiredPermissions: ['reports:export', 'ai-assistant:tools:execute-write'],
    requiresConfirmation: true,
    requiresApproval: false,
    inputSchema: objectSchema(
      { reportCode: STRING, format: { ...STRING, enum: ['CSV', 'XLSX', 'PDF'] } },
      ['reportCode', 'format'],
    ),
    outputSchema: objectSchema({ draft: { type: 'object' } }, ['draft']),
  },
  {
    name: 'simulations.createDraft',
    description: 'Cria uma simulação de remuneração em rascunho, sem efeito contratual.',
    riskLevel: 'LOW',
    requiredPermissions: ['simulations:create', 'ai-assistant:tools:execute-write'],
    requiresConfirmation: true,
    requiresApproval: false,
    inputSchema: objectSchema({ scenario: { type: 'object' } }, ['scenario']),
    outputSchema: objectSchema({ draft: { type: 'object' } }, ['draft']),
  },

  // ------------------------------------------------------------
  // ESCRITA SENSÍVEL (aprovação independente obrigatória)
  // ------------------------------------------------------------
  {
    name: 'configuration.prepareUpdate',
    description:
      'Prepara uma alteração de configuração da empresa para aprovação independente; nunca é aplicada directamente.',
    riskLevel: 'HIGH',
    requiredPermissions: ['configuration:manage', 'ai-assistant:tools:execute-write'],
    requiresConfirmation: true,
    requiresApproval: true,
    inputSchema: objectSchema({ changes: { type: 'object' } }, ['changes']),
    outputSchema: objectSchema({ draft: { type: 'object' } }, ['draft']),
  },
] as const;

/** Nomes canónicos do catálogo, por ordem de apresentação. */
export const AI_TOOL_NAMES: readonly string[] = AI_TOOL_CATALOG.map((tool) => tool.name);
