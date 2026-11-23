import { AiToolName } from '../value-objects/ai-tool-name.vo';
import { AiToolVersion } from '../value-objects/ai-tool-version.vo';
import { AiActionRisk } from '../value-objects/ai-action-risk.vo';

export interface AiToolCatalogEntry {
  name: string;
  version: string;
  riskLevel: string;
  requiredPermissions: readonly string[];
  requiresConfirmation: boolean;
  requiresApproval: boolean;
  isActive: boolean;
  inputSchema: Record<string, unknown>;
  module: string;
}

export interface AiToolPolicyDecision {
  allowed: boolean;
  reason?: string;
  entry?: AiToolCatalogEntry;
  risk: string;
}

export interface AiToolPolicyInput {
  toolName: string;
  toolVersion: string;
  grantedPermissions: readonly string[];
  profileAllows: readonly string[];
  availableTools: readonly AiToolCatalogEntry[];
}

/**
 * Política de ferramentas (RF-AI-018, RF-AI-044, RN-AI-016/017/019).
 *
 * Ordem de verificação:
 *  1. nome bem formado;
 *  2. ferramenta registada no catálogo;
 *  3. ferramenta activa;
 *  4. versão compatível;
 *  5. permissões do utilizador;
 *  6. âmbito do perfil.
 *
 * RN-AI-004: `ai-assistant:tools:execute-read` não concede
 * `employees:read` — as permissões da ferramenta são verificadas
 * cumulativamente.
 */
export class AiToolPolicyService {
  evaluate(input: AiToolPolicyInput): AiToolPolicyDecision {
    if (!AiToolName.isValid(input.toolName))
      return { allowed: false, reason: 'INVALID_TOOL_NAME', risk: 'READ_ONLY' };

    const entry = input.availableTools.find((tool) => tool.name === input.toolName);
    if (!entry) return { allowed: false, reason: 'TOOL_NOT_REGISTERED', risk: 'READ_ONLY' };

    if (!entry.isActive) return { allowed: false, reason: 'TOOL_DISABLED', risk: entry.riskLevel };

    if (!AiToolVersion.isValid(input.toolVersion) || !entry.version)
      return { allowed: false, reason: 'INVALID_TOOL_VERSION', risk: entry.riskLevel };

    if (!AiToolVersion.create(entry.version).isCompatibleWith(AiToolVersion.create(input.toolVersion)))
      return { allowed: false, reason: 'TOOL_VERSION_MISMATCH', risk: entry.riskLevel };

    if (!input.profileAllows.includes(entry.name))
      return { allowed: false, reason: 'PROFILE_NOT_PERMITTED', risk: entry.riskLevel };

    const missing = entry.requiredPermissions.filter(
      (permission) => !input.grantedPermissions.includes(permission),
    );
    if (missing.length)
      return { allowed: false, reason: `MISSING_PERMISSION:${missing.join(',')}`, risk: entry.riskLevel };

    return { allowed: true, entry, risk: entry.riskLevel };
  }

  /** Ferramentas de escrita exigem política explícita (invariante). */
  assertWritePolicy(entry: AiToolCatalogEntry): void {
    const risk = AiActionRisk.from(entry.riskLevel);
    if (risk.isWrite && !entry.requiresConfirmation && !entry.requiresApproval)
      throw new Error(`A ferramenta ${entry.name} não possui política de aprovação definida.`);
  }

  /** Nomes de ferramenta proibidos, qualquer que seja a configuração. */
  forbiddenPatterns(): readonly RegExp[] {
    return [
      /execute\s*sql/i,
      /run\s*shell/i,
      /update\s*any\s*record/i,
      /bypass\s*authorization/i,
      /^system\./i,
      /^eval\./i,
      /^filesystem\./i,
      /^network\./i,
    ];
  }

  isForbidden(toolName: string): boolean {
    return this.forbiddenPatterns().some((pattern) => pattern.test(toolName));
  }
}
