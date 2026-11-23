import { randomUUID } from 'crypto';
import { validateAiSchema } from '../../domain/services/ai-schema-validation.service';
import { AI_EVENTS } from '../../domain/events/ai-domain.event';
import { AiToolExecution } from '../../domain/aggregates/ai-tool-execution.aggregate';
import {
  AiToolUnavailableError,
  AiValidationError,
} from '../../domain/errors/ai-domain.error';
import type { AiToolDefinition } from '../../domain/aggregates/ai-tool-definition.aggregate';
import type { AiActionApproval } from '../../domain/aggregates/ai-action-approval.aggregate';
import type { AiModelToolCall } from '../ports/ai-model-gateway.port';
import type { AiToolExecutorPort } from '../ports/ai-tool-executor.port';
import type { AiAuditPort } from '../ports/ai-audit.port';
import type { AiUnitOfWorkPort } from '../ports/ai-unit-of-work.port';
import type { EventPublisherPort } from '../ports/event-publisher.port';
import type { AiActionProposalView } from '../dto/ai-interaction.dto';
import { AiAuthorizedContext } from '../use-cases/context.service';
import { AiActionService } from '../use-cases/action.service';
import { AiToolService } from '../use-cases/tool.service';
import { AiUsageService } from '../use-cases/usage.service';
import { aiPublishEvents } from '../use-cases/ai-event-dispatcher';
import { toProposalView } from '../use-cases/ai-views';

export type AiToolOutcomeKind = 'EXECUTED' | 'PROPOSED' | 'DENIED';

export interface AiToolOutcome {
  kind: AiToolOutcomeKind;
  toolName: string;
  toolVersion: string;
  /** Resultado estruturado quando a ferramenta foi executada. */
  result?: unknown;
  executionId?: string;
  proposal?: AiActionProposalView;
  reason?: string;
}

export interface AiToolOrchestratorInput {
  context: AiAuthorizedContext;
  interactionId: string;
  conversationId: string;
  calls: readonly AiModelToolCall[];
}

/**
 * Orquestrador de ferramentas (secção 12.4, RF-AI-044 a RF-AI-049).
 *
 * Para cada chamada devolvida pelo modelo:
 *
 *  1. valida nome e versão contra o catálogo registado;
 *  2. revalida permissões no MOMENTO da execução (RN-AI-019);
 *  3. `READ_ONLY` → executa de imediato via `AiToolExecutorPort`;
 *  4. escrita (`LOW`/`HIGH`) → cria proposta de acção que aguarda
 *     confirmação e, quando aplicável, aprovação independente;
 *  5. qualquer recusa é auditada e nunca interrompe a conversa — o
 *     utilizador recebe uma explicação.
 *
 * O modelo NUNCA decide o risco: vem da definição registada
 * (RN-AI-016/018).
 */
export class AiToolOrchestrator {
  constructor(
    private readonly tools: AiToolService,
    private readonly actions: AiActionService,
    private readonly usage: AiUsageService,
    private readonly executor: AiToolExecutorPort,
    private readonly unitOfWork: AiUnitOfWorkPort,
    private readonly audit: AiAuditPort,
    private readonly events: EventPublisherPort,
  ) {}

  async handle(input: AiToolOrchestratorInput): Promise<AiToolOutcome[]> {
    const outcomes: AiToolOutcome[] = [];

    for (const call of input.calls.slice(0, MAX_CALLS_PER_TURN)) {
      try {
        outcomes.push(await this.handleOne(input, call));
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Falha ao processar a ferramenta.';
        outcomes.push({
          kind: 'DENIED',
          toolName: String(call?.name ?? 'desconhecida'),
          toolVersion: '0.0.0',
          reason,
        });
      }
    }

    return outcomes;
  }

  private async handleOne(
    input: AiToolOrchestratorInput,
    call: AiModelToolCall,
  ): Promise<AiToolOutcome> {
    const { context } = input;
    const toolName = String(call?.name ?? '').trim();
    const toolVersion = this.resolveVersion(toolName);

    // 1–2. política de ferramentas com permissões actuais.
    const { decision, entry } = await this.tools.evaluateAsync(context, toolName, toolVersion);
    await this.tools.auditDecision(context, toolName, 'ALLOWED', decision.reason);

    validateAiSchema(call.arguments, entry.inputSchema);
    const args = structuredClone(call.arguments);

    // 3. leitura: execução imediata.
    if (entry.risk.value === 'READ_ONLY' && !entry.requiresConfirmation && !entry.requiresApproval) {
      return this.executeReadOnly(context, input, entry, args);
    }

    // 4. escrita: proposta humana.
    return this.proposeAction(context, input, entry, args);
  }

  /** Execução síncrona de ferramentas de leitura. */
  private async executeReadOnly(
    context: AiAuthorizedContext,
    input: AiToolOrchestratorInput,
    entry: AiToolDefinition,
    args: Record<string, unknown>,
  ): Promise<AiToolOutcome> {
    const idempotencyKey = `tool:${input.interactionId}:${entry.name}:${randomUUID()}`;

    const execution = AiToolExecution.start({
      tenantId: context.actor.tenantId,
      interactionId: input.interactionId,
      toolName: entry.name,
      toolVersion: entry.version,
      arguments: args,
      idempotencyKey,
      executedBy: context.actor.actorId,
    });

    await this.unitOfWork.run(context.actor.tenantId, async () => {
      execution.begin();
      await this.tools.saveExecution(execution);
    });

    try {
      const result = await this.executor.execute({
        toolName: entry.name,
        toolVersion: entry.version,
        arguments: args,
        actorId: String(context.actor.actorId),
        tenantId: String(context.actor.tenantId),
        interactionId: input.interactionId,
        idempotencyKey,
      });

      await this.unitOfWork.run(context.actor.tenantId, async () => {
        if (result.status === 'SUCCESS') execution.succeed(result.executionId);
        else if (result.status === 'DENIED') execution.deny(result.reason ?? 'Acesso negado.');
        else if (result.status === 'BLOCKED') execution.block(result.reason ?? 'Bloqueado.');
        else execution.fail(result.reason ?? 'Falha na execução.');
        await this.tools.saveExecution(execution);
      });

      await aiPublishEvents(this.events, [execution]);
      await this.audit.record({
        tenantId: context.actor.tenantId,
        actorId: context.actor.actorId,
        action: 'ai-tool.executed',
        entityType: 'ai_tool_execution',
        entityId: execution.id,
        outcome: result.status === 'SUCCESS' ? 'SUCCESS' : 'DENIED',
        correlationId: context.actor.requestId ?? null,
        after: { toolName: entry.name, status: result.status },
      });

      if (result.status !== 'SUCCESS') {
        return {
          kind: 'DENIED',
          toolName: entry.name,
          toolVersion: entry.version,
          executionId: execution.id,
          reason: result.reason ?? `Execução ${result.status}.`,
        };
      }

      return {
        kind: 'EXECUTED',
        toolName: entry.name,
        toolVersion: entry.version,
        executionId: execution.id,
        result: result.result,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Falha na execução.';
      await this.unitOfWork.run(context.actor.tenantId, async () => {
        execution.fail(reason);
        await this.tools.saveExecution(execution);
      });
      await aiPublishEvents(this.events, [execution]);
      return {
        kind: 'DENIED',
        toolName: entry.name,
        toolVersion: entry.version,
        executionId: execution.id,
        reason,
      };
    }
  }

  /** Cria a proposta de acção que aguarda confirmação/aprovação. */
  private async proposeAction(
    context: AiAuthorizedContext,
    input: AiToolOrchestratorInput,
    entry: AiToolDefinition,
    args: Record<string, unknown>,
  ): Promise<AiToolOutcome> {
    if (!context.policy.mayProposeWriteActions) {
      await this.tools.auditDecision(context, entry.name, 'DENIED', 'WRITE_NOT_ALLOWED');
      return {
        kind: 'DENIED',
        toolName: entry.name,
        toolVersion: entry.version,
        reason: 'O perfil actual não permite propor acções de escrita.',
      };
    }

    const proposal = await this.actions.propose({
      tenantId: context.actor.tenantId,
      interactionId: input.interactionId,
      conversationId: input.conversationId,
      proposedBy: context.actor.actorId,
      toolName: entry.name,
      toolVersion: entry.version,
      arguments: args,
      riskLevel: entry.risk.value,
      requiresConfirmation: entry.requiresConfirmation,
      requiresApproval: entry.requiresApproval,
    });

    await this.audit.record({
      tenantId: context.actor.tenantId,
      actorId: context.actor.actorId,
      action: 'ai-action.proposed',
      entityType: 'ai_action_approval',
      entityId: proposal.id,
      correlationId: context.actor.requestId ?? null,
      after: {
        toolName: entry.name,
        riskLevel: entry.risk.value,
        actionHash: proposal.actionHash,
      },
    });

    return {
      kind: 'PROPOSED',
      toolName: entry.name,
      toolVersion: entry.version,
      proposal: toProposalView(proposal),
      reason: entry.requiresApproval
        ? 'A acção aguarda aprovação independente.'
        : 'A acção aguarda confirmação do utilizador.',
    };
  }

  /**
   * Versão efectiva da ferramenta: usa a versão do catálogo
   * registado. O modelo não escolhe a versão (RN-AI-017).
   */
  private resolveVersion(toolName: string): string {
    const registered = AI_VERSIONS[toolName];
    if (registered) return registered;
    if (!toolName) throw new AiValidationError('Nome de ferramenta em falta.');
    throw new AiToolUnavailableError(`Ferramenta não registada: ${toolName}.`);
  }

  /** Remove chaves não escalares e limita o tamanho dos argumentos. */
  private sanitizeArguments(raw: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw ?? {})) {
      if (key.length > 64) continue;
      if (value === null || value === undefined) continue;
      const type = typeof value;
      if (type === 'string') out[key] = String(value).slice(0, 4000);
      else if (type === 'number' || type === 'boolean') out[key] = value;
      else if (Array.isArray(value)) out[key] = value.slice(0, 50);
      else if (type === 'object') out[key] = value;
    }
    return out;
  }
}

/** Limite de chamadas processadas por volta do modelo. */
const MAX_CALLS_PER_TURN = 8;

/**
 * Versões canónicas do catálogo (fonte: `ai-tool.catalog.ts`).
 * Mantidas localmente para resolver a versão sem consulta extra.
 */
const AI_VERSIONS: Readonly<Record<string, string>> = {
  'employees.search': '1.0.0',
  'employees.get': '1.0.0',
  'contracts.get': '1.0.0',
  'leave.getBalance': '1.0.0',
  'attendance.getSummary': '1.0.0',
  'salaryStructure.getAssignment': '1.0.0',
  'payroll.getRun': '1.0.0',
  'payslips.getOwn': '1.0.0',
  'reports.getSummary': '1.0.0',
  'legalRules.listPublished': '1.0.0',
  'documents.search': '1.0.0',
  'support.searchKnowledge': '1.0.0',
  'leave.createRequest': '1.0.0',
  'support.createTicket': '1.0.0',
  'reports.export': '1.0.0',
  'simulations.createDraft': '1.0.0',
  'configuration.prepareUpdate': '1.0.0',
};

/** Eventos que este orquestrador pode originar (referência). */
export const AI_TOOL_ORCHESTRATOR_EVENTS = [
  AI_EVENTS.TOOL_EXECUTED,
  AI_EVENTS.TOOL_FAILED,
  AI_EVENTS.TOOL_DENIED,
  AI_EVENTS.ACTION_PROPOSED,
] as const;

export type { AiActionApproval };
