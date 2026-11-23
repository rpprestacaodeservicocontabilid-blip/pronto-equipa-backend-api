import { AiToolDefinition } from '../../domain/aggregates/ai-tool-definition.aggregate';
import type { AiToolExecution } from '../../domain/aggregates/ai-tool-execution.aggregate';
import { AI_TOOL_CATALOG } from '../../domain/ai-tool.catalog';
import { AiToolUnavailableError } from '../../domain/errors/ai-domain.error';
import type { AiToolRepository } from '../../domain/repositories/ai-tool.repository';
import {
  AiToolCatalogEntry,
  AiToolPolicyDecision,
  AiToolPolicyService,
} from '../../domain/services/ai-tool-policy.service';
import type { AiAuditPort } from '../ports/ai-audit.port';
import type { AiToolExecutionView, AiToolView } from '../dto/ai-interaction.dto';
import { AiActorContext, AiContextService, AiAuthorizedContext } from './context.service';
import { toExecutionView, toToolView } from './ai-views';

const toCatalogEntry = (tool: AiToolDefinition): AiToolCatalogEntry => ({
  name: tool.name,
  version: tool.version,
  riskLevel: tool.risk.value,
  requiredPermissions: [...tool.requiredPermissions],
  requiresConfirmation: tool.requiresConfirmation,
  requiresApproval: tool.requiresApproval,
  isActive: tool.isActive,
  inputSchema: tool.inputSchema,
  module: tool.module,
});

/**
 * Casos de uso do catálogo e das execuções de ferramentas
 * (RF-AI-041 a RF-AI-045, RF-AI-050).
 *
 * RN-AI-016: só ferramentas registadas são avaliadas; a política é
 * aplicada com as permissões ACTUAIS do utilizador, nunca com as
 * permissões inferidas pelo modelo.
 */
export class AiToolService {
  private readonly policy = new AiToolPolicyService();

  constructor(
    private readonly tools: AiToolRepository,
    private readonly contextService: AiContextService,
    private readonly audit: AiAuditPort,
  ) {}

  /** Garante que o catálogo canónico está gravado (arranque/tests). */
  async syncCatalog(): Promise<number> {
    let created = 0;
    for (const definition of AI_TOOL_CATALOG) {
      const existing = await this.tools.findToolDefinition(definition.name, '1.0.0');
      if (existing) continue;
      await this.tools.saveToolDefinition(AiToolDefinition.create(definition));
      created += 1;
    }
    return created;
  }

  /** Catálogo com a disponibilidade calculada para o utilizador. */
  async list(actor: AiActorContext): Promise<AiToolView[]> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:tools:read');
    return this.listForContext(context);
  }

  async listForContext(context: AiAuthorizedContext): Promise<AiToolView[]> {
    const registered = await this.tools.listToolDefinitions({ status: 'ACTIVE' });
    return registered.map((tool) =>
      toToolView(tool, context.permissions, context.allowedTools),
    );
  }

  /**
   * Avalia uma ferramenta proposta pelo modelo (RN-AI-016/017/019).
   * Lança `AI_TOOL_UNAVAILABLE` quando a política não permite.
   */
  async evaluateAsync(
    context: AiAuthorizedContext,
    toolName: string,
    toolVersion: string,
  ): Promise<{ decision: AiToolPolicyDecision; entry: AiToolDefinition }> {
    if (this.policy.isForbidden(toolName))
      throw new AiToolUnavailableError(`Ferramenta não permitida: ${toolName}.`);

    context = await this.contextService.load(context.actor);
    const registered = await this.tools.listToolDefinitions({ status: 'ACTIVE' });
    const entries = registered.map(toCatalogEntry);
    const decision = this.policy.evaluate({
      toolName,
      toolVersion,
      grantedPermissions: context.permissions,
      profileAllows: context.allowedTools,
      availableTools: entries,
    });

    if (!decision.allowed || !decision.entry) {
      throw new AiToolUnavailableError(
        `Ferramenta indisponível: ${toolName} (${decision.reason ?? 'política'}).`,
      );
    }

    const entry = registered.find((tool) => tool.name === decision.entry?.name);
    if (!entry) throw new AiToolUnavailableError(`Ferramenta não registada: ${toolName}.`);
    await this.contextService.assertPermissions(context, [
      entry.risk.value === 'READ_ONLY' ? 'ai-assistant:tools:execute-read' : 'ai-assistant:tools:execute-write',
      ...entry.requiredPermissions,
    ]);

    // Invariante: toda ferramenta de escrita tem política definida.
    this.policy.assertWritePolicy(decision.entry);

    return { decision, entry };
  }

  async listExecutions(
    actor: AiActorContext,
    filter: { interactionId?: string; status?: string; page?: number; limit?: number },
  ): Promise<{ data: AiToolExecutionView[]; total: number; page: number; limit: number; totalPages: number }> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:tools:read');

    const page = await this.tools.listToolExecutions(actor.tenantId, {
      interactionId: filter.interactionId,
      status: filter.status,
      page: Math.max(1, Number(filter.page) || 1),
      limit: Math.min(100, Math.max(1, Number(filter.limit) || 20)),
    });

    return { ...page, data: page.data.map(toExecutionView) };
  }

  async getExecution(actor: AiActorContext, executionId: string): Promise<AiToolExecutionView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:tools:read');

    const execution = await this.tools.findToolExecution(actor.tenantId, executionId);
    if (!execution) throw new AiToolUnavailableError('Execução de ferramenta indisponível.');
    return toExecutionView(execution);
  }

  async findExecution(tenantId: number, executionId: string): Promise<AiToolExecution | null> {
    return this.tools.findToolExecution(tenantId, executionId);
  }

  async saveExecution(execution: AiToolExecution): Promise<AiToolExecution> {
    return this.tools.saveToolExecution(execution);
  }

  /** Auditoria de uma decisão de política de ferramentas. */
  async auditDecision(
    context: AiAuthorizedContext,
    toolName: string,
    decision: 'ALLOWED' | 'DENIED',
    reason?: string,
  ): Promise<void> {
    await this.audit.record({
      tenantId: context.actor.tenantId,
      actorId: context.actor.actorId,
      action: 'ai-tool.policy.evaluated',
      entityType: 'ai_tool_definition',
      entityId: toolName,
      outcome: decision === 'ALLOWED' ? 'SUCCESS' : 'DENIED',
      correlationId: context.actor.requestId ?? null,
      after: { decision, reason: reason ?? null },
    });
  }
}
