import { AiToolExecution } from '../../domain/aggregates/ai-tool-execution.aggregate';
import {
  AiApprovalRequiredError,
  AiToolUnavailableError,
} from '../../domain/errors/ai-domain.error';
import type { AiModelInvocation } from '../../domain/entities/ai-model-invocation.entity';
import type { AiToolExecutorPort } from '../ports/ai-tool-executor.port';
import type { AiAuditPort } from '../ports/ai-audit.port';
import type { AiUnitOfWorkPort } from '../ports/ai-unit-of-work.port';
import type { EventPublisherPort } from '../ports/event-publisher.port';
import type { AiActionProposalView } from '../dto/ai-interaction.dto';
import { AiContextService, AiAuthorizedContext } from '../use-cases/context.service';
import { AiActionService } from '../use-cases/action.service';
import { AiToolService } from '../use-cases/tool.service';
import { AiUsageService } from '../use-cases/usage.service';
import { aiPublishEvents } from '../use-cases/ai-event-dispatcher';
import { toProposalView } from '../use-cases/ai-views';

export interface AiExecuteApprovedActionInput {
  tenantId: number;
  actorId: number;
  proposalId: string;
  requestId?: string | null;
}

export interface AiExecuteApprovedActionResult {
  proposal: AiActionProposalView;
  executionId: string;
  status: 'SUCCESS' | 'FAILED' | 'DENIED' | 'BLOCKED';
  result?: unknown;
  reason?: string;
}

/**
 * Orquestrador de execução de acções aprovadas
 * (RF-AI-048/049, secção 20.2, RN-AI-017/019/020).
 *
 * Sequência obrigatória:
 *
 *  1. carrega a proposta do tenant (nunca por ID isolado);
 *  2. verifica que está apta a executar (`CONFIRMED`/`APPROVED`);
 *  3. REVALIDA as permissões do executor no momento da execução —
 *     uma aprovação antiga não substitui a autorização actual;
 *  4. confirma que os argumentos não mudaram desde a aprovação
 *     (CA-AI-016);
 *  5. executa via `AiToolExecutorPort` dentro de uma transacção;
 *  6. marca a proposta como executada e audita o resultado.
 *
 * A escrita efectiva nos módulos proprietários acontece nos casos de
 * uso oficiais, através da porta de ferramentas de negócio
 * (RN-AI-020).
 */
export class AiActionOrchestrator {
  constructor(
    private readonly actions: AiActionService,
    private readonly tools: AiToolService,
    private readonly contextService: AiContextService,
    private readonly usage: AiUsageService,
    private readonly executor: AiToolExecutorPort,
    private readonly unitOfWork: AiUnitOfWorkPort,
    private readonly audit: AiAuditPort,
    private readonly events: EventPublisherPort,
  ) {}

  async executeApproved(
    input: AiExecuteApprovedActionInput,
  ): Promise<AiExecuteApprovedActionResult> {
    const proposal = await this.actions.load(input.tenantId, input.proposalId);

    if (!['CONFIRMED', 'APPROVED'].includes(proposal.status))
      throw new AiApprovalRequiredError(
        `A proposta não está apta a execução (estado: ${proposal.status}).`,
      );

    if (proposal.isExpired()) {
      proposal.expire();
      await this.actions.save(proposal);
      throw new AiApprovalRequiredError('A proposta de acção expirou.');
    }

    // 3. revalidação de autorização no momento da execução.
    const context = await this.buildContext(input);
    const { entry } = await this.tools.evaluateAsync(
      context,
      proposal.toolName,
      proposal.toolVersion,
    );
    await this.tools.auditDecision(context, proposal.toolName, 'ALLOWED', 'EXECUTION_REVALIDATED');

    const args = proposal.argumentsJson;

    // 4. integridade dos argumentos aprovados (CA-AI-016).
    const execution = AiToolExecution.start({
      tenantId: input.tenantId,
      interactionId: proposal.interactionId,
      toolName: proposal.toolName,
      toolVersion: proposal.toolVersion,
      arguments: args,
      idempotencyKey: `action:${proposal.id}`,
      executedBy: input.actorId,
    });
    execution.assertArgumentsUnchanged(proposal.toolName, proposal.toolVersion, args);

    await this.unitOfWork.run(input.tenantId, async () => {
      execution.begin();
      await this.tools.saveExecution(execution);
    });

    // 5. execução efectiva.
    const outcome = await this.executor.execute({
      toolName: proposal.toolName,
      toolVersion: proposal.toolVersion,
      arguments: args,
      actorId: String(input.actorId),
      tenantId: String(input.tenantId),
      interactionId: proposal.interactionId,
      idempotencyKey: `action:${proposal.id}`,
    });

    await this.unitOfWork.run(input.tenantId, async () => {
      if (outcome.status === 'SUCCESS') execution.succeed(outcome.executionId);
      else if (outcome.status === 'DENIED') execution.deny(outcome.reason ?? 'Acesso negado.');
      else if (outcome.status === 'BLOCKED') execution.block(outcome.reason ?? 'Bloqueado.');
      else execution.fail(outcome.reason ?? 'Falha na execução.');
      await this.tools.saveExecution(execution);

      // 6. vínculo da proposta com a execução concluída.
      if (outcome.status === 'SUCCESS') proposal.markExecuted(execution.id, args);
      await this.actions.save(proposal);
    });

    await aiPublishEvents(this.events, [execution, proposal]);

    await this.audit.record({
      tenantId: input.tenantId,
      actorId: input.actorId,
      action:
        outcome.status === 'SUCCESS' ? 'ai-action.executed' : 'ai-action.execution-failed',
      entityType: 'ai_action_approval',
      entityId: proposal.id,
      outcome: outcome.status === 'SUCCESS' ? 'SUCCESS' : 'DENIED',
      correlationId: input.requestId ?? null,
      after: {
        toolName: proposal.toolName,
        executionId: execution.id,
        status: outcome.status,
        actionHash: proposal.actionHash,
      },
    });

    await this.recordUsage(input, entry.risk.value === 'READ_ONLY' ? 0 : 1);

    return {
      proposal: toProposalView(proposal),
      executionId: execution.id,
      status: outcome.status,
      result: outcome.result,
      reason: outcome.reason,
    };
  }

  /** Recusa explícita de uma proposta pendente. */
  async reject(
    input: AiExecuteApprovedActionInput & { reason: string },
  ): Promise<AiActionProposalView> {
    const proposal = await this.actions.reject(
      { tenantId: input.tenantId, actorId: input.actorId, requestId: input.requestId },
      input.proposalId,
      input.reason,
    );
    return proposal;
  }

  /** Confirmação do solicitante (RF-AI-047). */
  async confirm(
    input: AiExecuteApprovedActionInput,
  ): Promise<AiActionProposalView> {
    return this.actions.confirm(
      { tenantId: input.tenantId, actorId: input.actorId, requestId: input.requestId },
      input.proposalId,
    );
  }

  /** Aprovação por aprovador independente (RF-AI-048). */
  async approve(
    input: AiExecuteApprovedActionInput,
  ): Promise<AiActionProposalView> {
    return this.actions.approve(
      { tenantId: input.tenantId, actorId: input.actorId, requestId: input.requestId },
      input.proposalId,
    );
  }

  /** Constrói o contexto autorizado do executor para revalidação. */
  private async buildContext(
    input: AiExecuteApprovedActionInput,
  ): Promise<AiAuthorizedContext> {
    // A reutilização do serviço de contexto garante que as
    // permissões são relidas da fonte de autorização, nunca
    // copiadas da proposta.
    return this.contextService.load({
      tenantId: input.tenantId,
      actorId: input.actorId,
      requestId: input.requestId ?? null,
    });
  }

  /** Medição do consumo de execuções de ferramentas (RF-AI-064). */
  private async recordUsage(
    input: AiExecuteApprovedActionInput,
    toolExecutions: number,
  ): Promise<void> {
    if (toolExecutions <= 0) return;
    const period = AiActionOrchestrator.currentPeriod();
    const account = await this.usage.account(input.tenantId, period);
    account.recordUsage({ toolExecutions, reservedTokens: 0 });
    await this.usage.save(account);
  }

  private static currentPeriod(now = new Date()): string {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}

export type { AiModelInvocation };
export { AiToolUnavailableError };
