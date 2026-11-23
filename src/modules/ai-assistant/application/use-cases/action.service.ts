import { AiActionApproval } from '../../domain/aggregates/ai-action-approval.aggregate';
import { AiNotFoundError } from '../../domain/errors/ai-domain.error';
import type { AiToolRepository } from '../../domain/repositories/ai-tool.repository';
import { AiApprovalPolicyService } from '../../domain/services/ai-approval-policy.service';
import type { AiAuditPort } from '../ports/ai-audit.port';
import type { EventPublisherPort } from '../ports/event-publisher.port';
import type { AiActionProposalView } from '../dto/ai-interaction.dto';
import { AiActorContext, AiContextService } from './context.service';
import { aiPublishEvents } from './ai-event-dispatcher';
import { toProposalView } from './ai-views';

export interface AiProposeActionInput {
  tenantId: number;
  interactionId: string;
  conversationId: string;
  proposedBy: number;
  toolName: string;
  toolVersion: string;
  arguments: Record<string, unknown>;
  riskLevel: string;
  requiresConfirmation?: boolean;
  requiresApproval?: boolean;
  ttlMinutes?: number;
}

/**
 * Casos de uso de propostas e aprovação humana (RF-AI-046 a
 * RF-AI-049, secção 20.2, RN-AI-018).
 *
 * A confirmação é sempre registada pela aplicação num endpoint
 * próprio — nunca é interpretada a partir de uma frase gerada pelo
 * modelo.
 */
export class AiActionService {
  private readonly approvalPolicy = new AiApprovalPolicyService();

  constructor(
    private readonly tools: AiToolRepository,
    private readonly contextService: AiContextService,
    private readonly audit: AiAuditPort,
    private readonly events: EventPublisherPort,
  ) {}

  /** Cria a proposta devolvida ao utilizador (uso interno). */
  async propose(input: AiProposeActionInput): Promise<AiActionApproval> {
    const proposal = AiActionApproval.propose(input);
    await this.tools.saveActionApproval(proposal);
    await aiPublishEvents(this.events, [proposal]);
    return proposal;
  }

  async list(
    actor: AiActorContext,
    filter: { status?: string; page?: number; limit?: number } = {},
  ): Promise<{
    data: AiActionProposalView[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:actions:read');

    const page = await this.tools.listActionProposals(actor.tenantId, {
      status: filter.status,
      page: Math.max(1, Number(filter.page) || 1),
      limit: Math.min(100, Math.max(1, Number(filter.limit) || 20)),
    });

    return { ...page, data: page.data.map(toProposalView) };
  }

  async get(actor: AiActorContext, proposalId: string): Promise<AiActionProposalView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:actions:read');
    return toProposalView(await this.load(actor.tenantId, proposalId));
  }

  /** Confirmação do solicitante (RF-AI-047). */
  async confirm(actor: AiActorContext, proposalId: string): Promise<AiActionProposalView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:actions:confirm');

    const proposal = await this.load(actor.tenantId, proposalId);
    const decision = this.approvalPolicy.evaluate({
      riskLevel: proposal.riskLevel,
      requiresConfirmation: proposal.requiresConfirmation,
      requiresApproval: proposal.requiresApproval,
      proposedBy: proposal.proposedBy,
      actorId: actor.actorId,
    });
    if (!decision.canConfirm) throw new AiNotFoundError('Confirmação não aplicável a esta acção.');

    proposal.confirm(actor.actorId);
    await this.tools.saveActionApproval(proposal);
    await this.decide(actor, proposal, 'confirmed');

    return toProposalView(proposal);
  }

  /** Aprovação por aprovador independente (RF-AI-048). */
  async approve(actor: AiActorContext, proposalId: string): Promise<AiActionProposalView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:actions:approve');

    const proposal = await this.load(actor.tenantId, proposalId);
    const decision = this.approvalPolicy.evaluate({
      riskLevel: proposal.riskLevel,
      requiresConfirmation: proposal.requiresConfirmation,
      requiresApproval: proposal.requiresApproval,
      proposedBy: proposal.proposedBy,
      actorId: actor.actorId,
    });
    if (!decision.canApprove) throw new AiNotFoundError('Aprovação não permitida a este utilizador.');

    proposal.approve(actor.actorId);
    await this.tools.saveActionApproval(proposal);
    await this.decide(actor, proposal, 'approved');

    return toProposalView(proposal);
  }

  async reject(
    actor: AiActorContext,
    proposalId: string,
    reason: string,
  ): Promise<AiActionProposalView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:actions:reject');

    const proposal = await this.load(actor.tenantId, proposalId);
    proposal.reject(actor.actorId, reason);
    await this.tools.saveActionApproval(proposal);
    await this.decide(actor, proposal, 'rejected');

    return toProposalView(proposal);
  }

  async cancel(actor: AiActorContext, proposalId: string): Promise<AiActionProposalView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:actions:confirm');

    const proposal = await this.load(actor.tenantId, proposalId);
    proposal.cancel(actor.actorId);
    await this.tools.saveActionApproval(proposal);

    return toProposalView(proposal);
  }

  /** Carrega uma proposta do tenant e expira-a se necessário. */
  async load(tenantId: number, proposalId: string): Promise<AiActionApproval> {
    const proposal = await this.tools.findActionApproval(tenantId, proposalId);
    if (!proposal) throw new AiNotFoundError('Proposta de acção indisponível.');
    if (proposal.isExpired() && ['PROPOSED', 'CONFIRMED'].includes(proposal.status)) {
      proposal.expire();
      await this.tools.saveActionApproval(proposal);
    }
    return proposal;
  }

  async save(proposal: AiActionApproval): Promise<AiActionApproval> {
    return this.tools.saveActionApproval(proposal);
  }

  private async decide(
    actor: AiActorContext,
    proposal: AiActionApproval,
    action: 'confirmed' | 'approved' | 'rejected',
  ): Promise<void> {
    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action: `ai-action.${action}`,
      entityType: 'ai_action_approval',
      entityId: proposal.id,
      outcome: action === 'rejected' ? 'DENIED' : 'SUCCESS',
      correlationId: actor.requestId ?? null,
      after: {
        toolName: proposal.toolName,
        riskLevel: proposal.riskLevel,
        actionHash: proposal.actionHash,
        status: proposal.status,
      },
    });
    await aiPublishEvents(this.events, [proposal]);
  }
}
