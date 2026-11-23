import type { AiInteraction } from '../../domain/aggregates/ai-interaction.aggregate';
import type { AiModelInvocation } from '../../domain/entities/ai-model-invocation.entity';
import { AiNotFoundError } from '../../domain/errors/ai-domain.error';
import type { AiInteractionRepository } from '../../domain/repositories/ai-interaction.repository';
import type { AiContextService, AiActorContext } from './context.service';
import type { AiInteractionView } from '../dto/ai-interaction.dto';
import { toInteractionView } from './ai-views';

/**
 * Casos de leitura das interacções (RF-AI-003/008/009/010) e do
 * registo das invocações de modelo (RF-AI-051/060).
 *
 * Cada interacção guarda a versão efectivamente usada, permitindo
 * auditoria e reprodutibilidade (RN-AI-013).
 */
export class AiInteractionService {
  constructor(
    private readonly interactions: AiInteractionRepository,
    private readonly contextService: AiContextService,
  ) {}

  async get(actor: AiActorContext, interactionId: string): Promise<AiInteractionView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:messages:read-own');

    const interaction = await this.interactions.findInteraction(actor.tenantId, interactionId);
    if (!interaction) throw new AiNotFoundError('Interação indisponível para este contexto.');
    await this.contextService.assertConversation(context, interaction.conversationId);
    return toInteractionView(interaction);
  }

  async list(
    actor: AiActorContext,
    filter: { conversationId?: string; page?: number; limit?: number },
  ): Promise<{
    data: AiInteractionView[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:messages:read-own');

    const page = await this.interactions.listInteractions(actor.tenantId, {
      conversationId: filter.conversationId,
      userId: actor.actorId,
      page: Math.max(1, Number(filter.page) || 1),
      limit: Math.min(100, Math.max(1, Number(filter.limit) || 20)),
    });

    return { ...page, data: page.data.map(toInteractionView) };
  }

  /** Interacções activas do utilizador (controlo de concorrência). */
  async countActive(tenantId: number, userId: number): Promise<number> {
    return this.interactions.countActiveInteractions(tenantId, userId);
  }

  // ------------------------------------------------------------
  // Operações internas do orquestrador
  // ------------------------------------------------------------

  async find(tenantId: number, interactionId: string): Promise<AiInteraction | null> {
    return this.interactions.findInteraction(tenantId, interactionId);
  }

  async findByIdempotencyKey(
    tenantId: number,
    conversationId: string,
    idempotencyKey: string,
  ): Promise<AiInteraction | null> {
    return this.interactions.findByIdempotencyKey(tenantId, conversationId, idempotencyKey);
  }

  async save(interaction: AiInteraction): Promise<AiInteraction> {
    return this.interactions.saveInteraction(interaction);
  }

  async saveInvocation(invocation: AiModelInvocation): Promise<AiModelInvocation> {
    return this.interactions.saveModelInvocation(invocation);
  }

  async listInvocations(
    tenantId: number,
    interactionId: string,
  ): Promise<AiModelInvocation[]> {
    return this.interactions.listModelInvocations(tenantId, interactionId);
  }
}
