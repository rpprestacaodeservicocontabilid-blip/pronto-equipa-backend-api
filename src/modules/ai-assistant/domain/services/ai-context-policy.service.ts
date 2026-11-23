import { AiToolName } from '../value-objects/ai-tool-name.vo';

export const AI_PROFILES = [
  'PLATFORM_ADMIN',
  'COMPANY_ADMIN',
  'HR_MANAGER',
  'HR_SPECIALIST',
  'FINANCE_MANAGER',
  'SUPERVISOR',
  'EMPLOYEE',
  'SUPPORT_AGENT',
] as const;
export type AiProfile = (typeof AI_PROFILES)[number];

export interface AiContextPolicyInput {
  tenantId: number;
  userId: number;
  profile: AiProfile;
  permissions: readonly string[];
  classificationLabels?: readonly string[];
}

export interface AiContextPolicyResult {
  profile: AiProfile;
  tenantId: number;
  userId: number;
  allowedTools: readonly string[];
  knowledgeScope: 'PLATFORM' | 'TENANT' | 'NONE';
  allowedClassifications: readonly string[];
  redactionRules: readonly string[];
  mayReadSalaryData: boolean;
  mayProposeWriteActions: boolean;
  policyVersion: string;
}

/**
 * Política de contexto autorizado (RF-AI-014, RF-AI-015, RF-AI-017).
 *
 * O contexto é construído a partir do perfil e das permissões
 * EFECTIVAS do utilizador — o modelo nunca amplia o âmbito.
 * RN-AI-004: o modelo não concede permissões.
 */
const CLASSIFICATION_LADDER = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];

const PROFILE_CLASSIFICATIONS: Readonly<Record<AiProfile, readonly string[]>> = {
  PLATFORM_ADMIN: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'],
  COMPANY_ADMIN: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'],
  HR_MANAGER: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
  HR_SPECIALIST: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
  FINANCE_MANAGER: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
  SUPERVISOR: ['PUBLIC', 'INTERNAL'],
  EMPLOYEE: ['PUBLIC', 'INTERNAL'],
  SUPPORT_AGENT: ['PUBLIC', 'INTERNAL'],
};

const PROFILE_REDACTION: Readonly<Record<AiProfile, readonly string[]>> = {
  PLATFORM_ADMIN: [],
  COMPANY_ADMIN: ['nationalId', 'bankAccount', 'taxIdentification'],
  HR_MANAGER: ['nationalId', 'bankAccount'],
  HR_SPECIALIST: ['nationalId', 'bankAccount', 'salaryAmount'],
  FINANCE_MANAGER: ['nationalId', 'personalContact'],
  SUPERVISOR: ['nationalId', 'bankAccount', 'salaryAmount', 'personalContact'],
  EMPLOYEE: ['nationalId', 'bankAccount', 'salaryAmount', 'personalContact', 'dependents'],
  SUPPORT_AGENT: ['nationalId', 'bankAccount', 'salaryAmount', 'personalContact', 'dependents'],
};

/** Ferramentas de leitura permitidas por perfil, para além das permissões. */
const PROFILE_TOOL_PREFIXES: Readonly<Record<AiProfile, readonly string[]>> = {
  PLATFORM_ADMIN: ['reports.', 'legalRules.', 'documents.', 'support.'],
  COMPANY_ADMIN: ['employees.', 'contracts.', 'leave.', 'attendance.', 'salaryStructure.', 'payroll.', 'payslips.', 'reports.', 'legalRules.', 'documents.', 'support.', 'simulations.', 'configuration.'],
  HR_MANAGER: ['employees.', 'contracts.', 'leave.', 'attendance.', 'salaryStructure.', 'payroll.', 'payslips.', 'reports.', 'legalRules.', 'documents.', 'support.', 'simulations.', 'configuration.'],
  HR_SPECIALIST: ['employees.', 'contracts.', 'leave.', 'attendance.', 'documents.', 'support.'],
  FINANCE_MANAGER: ['payroll.', 'payslips.', 'reports.', 'simulations.', 'documents.', 'configuration.'],
  SUPERVISOR: ['employees.', 'leave.', 'attendance.', 'reports.'],
  EMPLOYEE: ['payslips.', 'leave.', 'contracts.', 'documents.', 'support.'],
  SUPPORT_AGENT: ['support.', 'documents.', 'legalRules.'],
};

export const AI_POLICY_VERSION = '2026.11';

/**
 * As permissões do produto misturam separadores (`payroll:read` e
 * `employees.read`). A comparação é feita sobre uma forma normalizada
 * para que a política seja indiferente ao separador usado pelo módulo
 * proprietário.
 */
const normalizePermission = (permission: string): string =>
  String(permission ?? '').trim().toLowerCase().replace(/:/g, '.');

const permissionSet = (permissions: readonly string[]): Set<string> =>
  new Set(permissions.map(normalizePermission));

export class AiContextPolicyService {
  /** Perfil derivado das permissões efectivas (nunca do pedido). */
  resolveProfile(permissions: readonly string[]): AiProfile {
    const granted = permissionSet(permissions);
    const has = (...candidates: string[]) =>
      candidates.some((candidate) => granted.has(normalizePermission(candidate)));

    if (has('platform:ai-assistant:admin', 'ai-assistant:admin:manage')) return 'PLATFORM_ADMIN';
    if (has('payroll:read') && has('employees:read', 'employees.read')) return 'HR_MANAGER';
    if (has('employees:read', 'employees.read')) return 'HR_SPECIALIST';
    if (has('reports:read', 'reports.read') && has('payroll:read')) return 'FINANCE_MANAGER';
    if (has('employees:team:read', 'employees.team.read')) return 'SUPERVISOR';
    if (has('support:tickets:read-team', 'support.knowledge:read', 'support:knowledge:read'))
      return 'SUPPORT_AGENT';
    if (has('payslips:read-own', 'payslips:read', 'leave:read-own', 'leave.requests.read'))
      return 'EMPLOYEE';
    return 'EMPLOYEE';
  }

  build(input: AiContextPolicyInput): AiContextPolicyResult {
    const profile = input.profile;
    const permissions = [...new Set(input.permissions)];
    const granted = permissionSet(permissions);
    const has = (permission: string) => granted.has(normalizePermission(permission));

    const labels = input.classificationLabels ?? [];
    const allowedClassifications = labels.length
      ? PROFILE_CLASSIFICATIONS[profile].filter((label) => labels.includes(label))
      : [...PROFILE_CLASSIFICATIONS[profile]];

    const mayReadSalaryData =
      has('payroll:read') || has('payslips:read-all') || has('salary-structure:read');

    return {
      profile,
      tenantId: input.tenantId,
      userId: input.userId,
      allowedTools: [], // preenchido pelo registo de ferramentas após validação de permissões
      knowledgeScope: has('ai-assistant:knowledge:read') ? 'TENANT' : 'NONE',
      allowedClassifications,
      redactionRules: [...PROFILE_REDACTION[profile]],
      mayReadSalaryData,
      mayProposeWriteActions: has('ai-assistant:tools:execute-write'),
      policyVersion: AI_POLICY_VERSION,
    };
  }

  /** Filtra o catálogo de ferramentas pelo perfil e permissões. */
  filterTools(
    tools: ReadonlyArray<{ name: string; requiredPermissions: readonly string[]; isActive: boolean }>,
    context: AiContextPolicyResult,
    permissions: readonly string[],
  ): string[] {
    const prefixes = PROFILE_TOOL_PREFIXES[context.profile];
    const granted = permissionSet(permissions);
    return tools
      .filter((tool) => {
        if (!tool.isActive) return false;
        const module = tool.name.slice(0, tool.name.indexOf('.'));
        if (!prefixes.some((prefix) => tool.name.startsWith(prefix) || prefix.startsWith(`${module}.`)))
          return false;
        return tool.requiredPermissions.every((permission) =>
          granted.has(normalizePermission(permission)),
        );
      })
      .map((tool) => tool.name);
  }

  /** Remove campos sensíveis de um payload antes de enviar ao modelo. */
  redact<T>(value: T, rules: readonly string[]): T {
    if (!rules.length) return value;
    const walk = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(walk);
      if (node && typeof node === 'object') {
        const source = node as Record<string, unknown>;
        const output: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(source)) {
          output[key] = rules.includes(key) ? '[PROTECTIDO]' : walk(entry);
        }
        return output;
      }
      return node;
    };
    return walk(value) as T;
  }

  /** Rótulos de classificação válidos, por ordem crescente. */
  classificationLadder(): readonly string[] {
    return CLASSIFICATION_LADDER;
  }
}

export const isAiProfile = (value: unknown): value is AiProfile =>
  typeof value === 'string' && (AI_PROFILES as readonly string[]).includes(value);

export const isToolNameAllowed = (name: string, allowed: readonly string[]): boolean =>
  AiToolName.isValid(name) && allowed.includes(name);
