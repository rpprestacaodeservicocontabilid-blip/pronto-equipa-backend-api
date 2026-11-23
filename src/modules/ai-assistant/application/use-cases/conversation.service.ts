import {
  AiValidationError,
  AiNotFoundError,
} from '../../domain/errors/ai-domain.error';
import { AiConversation } from '../../domain/aggregates/ai-conversation.aggregate';
import { AiFeedback } from '../../domain/entities/ai-feedback.entity';
import { AiMessage } from '../../domain/entities/ai-message.entity';
import { AiMessageCitation } from '../../domain/entities/ai-message-citation.entity';
import type {
  AiConversationRepository,
  AiConversationListQuery,
} from '../../domain/repositories/ai-conversation.repository';
import type { AiInteractionRepository } from '../../domain/repositories/ai-interaction.repository';
import type { AiAuditPort } from '../ports/ai-audit.port';
import type { EventPublisherPort } from '../ports/event-publisher.port';
import type {
  AiConversationDetail,
  AiConversationListResult,
  AiConversationView,
  AiFeedbackRequest,
  CreateAiConversationRequest,
} from '../dto/ai-conversation.dto';
import { AiContextService, AiActorContext } from './context.service';
import { aiPublishEvents } from './ai-event-dispatcher';
import { toConversationView, toMessageView } from './ai-views';

const MAX_PAGE_SIZE = 100;
const MESSAGES_PAGE_SIZE = 200;

/**
 * Casos de uso do ciclo de vida das conversas (RF-AI-001 a
 * RF-AI-007, RF-AI-010).
 *
 * O dono da conversa é sempre o utilizador autenticado; o âmbito de
 * leitura é revalidado em cada operação (RN-AI-006).
 */
export class AiConversationService {
  constructor(
    private readonly conversations: AiConversationRepository,
    private readonly interactions: AiInteractionRepository,
    private readonly contextService: AiContextService,
    private readonly audit: AiAuditPort,
    private readonly events: EventPublisherPort,
  ) {}

  async create(
    actor: AiActorContext,
    input: CreateAiConversationRequest,
  ): Promise<AiConversationView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:conversations:create');

    const conversation = AiConversation.create({
      tenantId: actor.tenantId,
      userId: actor.actorId,
      title: input.title,
    });
    await this.conversations.saveConversation(conversation);

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action: 'ai-assistant.conversation.created',
      entityType: 'ai_conversation',
      entityId: conversation.id,
      correlationId: actor.requestId ?? null,
      after: { title: conversation.title, status: conversation.status },
    });
    await aiPublishEvents(this.events, [conversation]);

    return toConversationView(conversation);
  }

  async list(
    actor: AiActorContext,
    query: { page?: number; limit?: number; status?: string; search?: string },
  ): Promise<AiConversationListResult> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:conversations:read-own');

    const listQuery: AiConversationListQuery = {
      page: Math.max(1, Number(query.page) || 1),
      limit: Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit) || 20)),
      status: query.status,
      search: query.search,
    };
    const page = await this.conversations.listConversations(
      actor.tenantId,
      actor.actorId,
      listQuery,
    );

    return {
      data: page.data.map(toConversationView),
      total: page.total,
      page: page.page,
      limit: page.limit,
      totalPages: page.totalPages,
    };
  }

  async detail(
    actor: AiActorContext,
    conversationId: string,
    options: { page?: number; limit?: number } = {},
  ): Promise<AiConversationDetail> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:conversations:read-own');
    const conversation = await this.contextService.assertConversation(context, conversationId);

    const page = await this.conversations.listMessages(actor.tenantId, conversationId, {
      page: Math.max(1, Number(options.page) || 1),
      limit: Math.min(MESSAGES_PAGE_SIZE, Math.max(1, Number(options.limit) || MESSAGES_PAGE_SIZE)),
    });

    const messages = await Promise.all(
      page.data.map(async (message) =>
        toMessageView(message, await this.conversations.listCitations(actor.tenantId, message.id)),
      ),
    );

    return { ...toConversationView(conversation), messages };
  }

  async rename(actor: AiActorContext, conversationId: string, title: string): Promise<AiConversationView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:conversations:manage-own');
    const conversation = await this.contextService.assertConversation(context, conversationId);
    conversation.rename(title);
    await this.conversations.saveConversation(conversation);
    return toConversationView(conversation);
  }

  async archive(actor: AiActorContext, conversationId: string): Promise<AiConversationView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:conversations:manage-own');
    const conversation = await this.contextService.assertConversation(context, conversationId);

    conversation.archive();
    await this.conversations.saveConversation(conversation);
    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action: 'ai-assistant.conversation.archived',
      entityType: 'ai_conversation',
      entityId: conversation.id,
      correlationId: actor.requestId ?? null,
    });
    await aiPublishEvents(this.events, [conversation]);

    return toConversationView(conversation);
  }

  async reactivate(actor: AiActorContext, conversationId: string): Promise<AiConversationView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:conversations:manage-own');
    const conversation = await this.contextService.assertConversation(context, conversationId);

    conversation.reactivate();
    await this.conversations.saveConversation(conversation);

    return toConversationView(conversation);
  }

  async remove(actor: AiActorContext, conversationId: string): Promise<AiConversationView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:conversations:manage-own');
    const conversation = await this.contextService.assertConversation(context, conversationId);

    conversation.markDeleted();
    await this.conversations.saveConversation(conversation);
    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action: 'ai-assistant.conversation.deleted',
      entityType: 'ai_conversation',
      entityId: conversation.id,
      correlationId: actor.requestId ?? null,
    });

    return toConversationView(conversation);
  }

  /** Avaliação de uma resposta (RF-AI-010, RF-AI-075). */
  async submitFeedback(
    actor: AiActorContext,
    interactionId: string,
    input: AiFeedbackRequest,
  ): Promise<{ id: string; rating: number; interactionId: string }> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:messages:read-own');

    const interaction = await this.interactions.findInteraction(actor.tenantId, interactionId);
    if (!interaction) throw new AiNotFoundError('Interação indisponível para este contexto.');

    await this.contextService.assertConversation(context, interaction.conversationId);
    const existing = await this.interactions.findFeedback(
      actor.tenantId,
      interactionId,
      actor.actorId,
    );
    if (existing) throw new AiValidationError('A resposta já foi avaliada por este utilizador.');

    const feedback = AiFeedback.create({
      tenantId: actor.tenantId,
      interactionId,
      userId: actor.actorId,
      rating: input.rating,
      comment: input.comment,
      category: input.category,
    });
    await this.interactions.saveFeedback(feedback);

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action: 'ai-assistant.feedback.submitted',
      entityType: 'ai_interaction',
      entityId: interactionId,
      correlationId: actor.requestId ?? null,
      after: { rating: feedback.rating, category: feedback.category },
    });

    return { id: feedback.id, rating: feedback.rating, interactionId: feedback.interactionId };
  }

  // ------------------------------------------------------------------
  // Operações internas usadas pelo orquestrador de conversa
  // ------------------------------------------------------------------

  /**
   * Histórico recente em ordem cronológica, para compor o contexto
   * enviado ao modelo (RN-AI-007 — minimização de conteúdo).
   */
  async recentMessages(
    tenantId: number,
    conversationId: string,
    limit: number,
  ): Promise<AiMessage[]> {
    const size = Math.min(100, Math.max(1, limit));
    const first = await this.conversations.listMessages(tenantId, conversationId, {
      page: 1,
      limit: size,
    });
    if (first.totalPages <= 1) return [...first.data].reverse();

    const last = await this.conversations.listMessages(tenantId, conversationId, {
      page: first.totalPages,
      limit: size,
    });
    return [...last.data].reverse();
  }

  /** Grava a mensagem do utilizador e incrementa o contador. */
  async appendUserMessage(
    conversation: AiConversation,
    input: { content: string; idempotencyKey: string },
  ): Promise<AiMessage> {
    const existing = await this.conversations.findMessageByIdempotencyKey(
      conversation.tenantId,
      conversation.id,
      input.idempotencyKey,
    );
    if (existing) return existing;

    const message = AiMessage.create({
      tenantId: conversation.tenantId,
      conversationId: conversation.id,
      role: 'USER',
      content: input.content,
    });
    await this.conversations.saveMessage(message);

    conversation.registerMessage(message.createdAt);
    await this.conversations.saveConversation(conversation);

    return message;
  }

  /** Grava a resposta do assistente. */
  async appendAssistantMessage(input: {
    tenantId: number;
    conversationId: string;
    interactionId: string;
    content: string;
    safetyClassification?: string;
  }): Promise<AiMessage> {
    const message = AiMessage.create({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      role: 'ASSISTANT',
      content: input.content,
      interactionId: input.interactionId,
      safetyClassification: input.safetyClassification,
    });
    return this.conversations.saveMessage(message);
  }

  async saveCitations(
    tenantId: number,
    messageId: string,
    citations: ReadonlyArray<{
      sourceId: string;
      title: string;
      reference: string;
      chunkId?: string | null;
      score?: number;
    }>,
  ): Promise<void> {
    for (const citation of citations) {
      await this.conversations.saveCitation(
        AiMessageCitation.create({ tenantId, messageId, ...citation }),
      );
    }
  }
}
