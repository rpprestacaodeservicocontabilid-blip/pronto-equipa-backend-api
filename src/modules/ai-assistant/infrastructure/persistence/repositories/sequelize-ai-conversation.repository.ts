import { Op, WhereOptions } from 'sequelize';
import { AiConversation } from '../../../domain/aggregates/ai-conversation.aggregate';
import { AiContextSnapshot } from '../../../domain/entities/ai-context-snapshot.entity';
import { AiMessage } from '../../../domain/entities/ai-message.entity';
import { AiMessageCitation } from '../../../domain/entities/ai-message-citation.entity';
import type {
  AiConversationListQuery,
  AiConversationRepository,
  AiPaginated,
} from '../../../domain/repositories/ai-conversation.repository';
import {
  AiContextSnapshotModel,
  AiConversationModel,
  AiMessageCitationModel,
  AiMessageModel,
  type AiConversationAttributes,
} from '../models/ai-conversation.model';
import { aiQueryOptions } from '../ai-transaction-context';

const DEFAULT_PAGE_SIZE = 20;

const paginate = <T>(total: number, data: T[], page: number, limit: number): AiPaginated<T> => ({
  data,
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / Math.max(1, limit))),
});

const toConversation = (row: AiConversationModel): AiConversation =>
  AiConversation.restore({
    id: row.id,
    tenantId: row.companyId,
    userId: row.userId,
    title: row.title,
    status: row.status,
    messageCount: row.messageCount,
    lastMessageAt: row.lastMessageAt,
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const toMessage = (row: AiMessageModel): AiMessage =>
  AiMessage.restore({
    id: row.id,
    tenantId: row.companyId,
    conversationId: row.conversationId,
    interactionId: row.interactionId,
    role: row.role as AiMessage['role'],
    content: row.content,
    safetyClassification: row.safetyClassification,
    contentReference: row.contentReference ?? undefined,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
  });

const toCitation = (row: AiMessageCitationModel): AiMessageCitation =>
  AiMessageCitation.restore({
    id: row.id,
    tenantId: row.companyId,
    messageId: row.messageId,
    sourceId: row.sourceId,
    title: row.title,
    reference: row.reference,
    chunkId: row.chunkId,
    score: row.score,
    createdAt: row.createdAt,
  });

/**
 * Implementação Sequelize do contrato de conversas
 * (RF-AI-001 a RF-AI-007).
 *
 * Todas as consultas exigem `companyId` e `userId`: o isolamento
 * (RN-AI-006) é aplicado na query, nunca depois de carregar os
 * registos.
 */
export class SequelizeAiConversationRepository implements AiConversationRepository {
  async saveConversation(conversation: AiConversation): Promise<AiConversation> {
    const props = conversation.propsSnapshot;
    await AiConversationModel.upsert(
      {
        id: props.id,
        companyId: props.tenantId,
        userId: props.userId,
        title: props.title,
        status: props.status,
        messageCount: props.messageCount,
        lastMessageAt: props.lastMessageAt,
        archivedAt: props.archivedAt,
        deletedAt: props.deletedAt,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      aiQueryOptions(),
    );
    return conversation;
  }

  async findConversation(
    tenantId: number,
    conversationId: string,
    userId: number,
  ): Promise<AiConversation | null> {
    const row = await AiConversationModel.findOne({
      where: {
        id: conversationId,
        companyId: tenantId,
        userId,
        deletedAt: null,
      },
      ...aiQueryOptions(),
    });
    return row ? toConversation(row) : null;
  }

  async listConversations(
    tenantId: number,
    userId: number,
    query: AiConversationListQuery,
  ): Promise<AiPaginated<AiConversation>> {
    const page = Math.max(1, query.page);
    const limit = Math.min(200, Math.max(1, query.limit || DEFAULT_PAGE_SIZE));
    const where: WhereOptions<AiConversationAttributes> = { companyId: tenantId, userId };

    if (!query.includeDeleted) where.deletedAt = null;
    if (query.status) where.status = query.status;
    if (query.search)
      where.title = { [Op.like]: `%${String(query.search).replace(/[%_]/g, '')}%` };

    const { count, rows } = await AiConversationModel.findAndCountAll({
      where,
      order: [
        ['updatedAt', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      offset: (page - 1) * limit,
      limit,
      ...aiQueryOptions(),
    });

    return paginate(count, rows.map(toConversation), page, limit);
  }

  async saveMessage(message: AiMessage): Promise<AiMessage> {
    await AiMessageModel.upsert(
      {
        id: message.id,
        companyId: message.tenantId,
        conversationId: message.conversationId,
        interactionId: message.interactionId,
        role: message.role,
        content: message.content,
        safetyClassification: message.safetyClassification,
        contentReference: message.contentReference,
        idempotencyKey: message.idempotencyKey,
        createdAt: message.createdAt,
      },
      aiQueryOptions(),
    );
    return message;
  }

  async findMessage(tenantId: number, messageId: string): Promise<AiMessage | null> {
    const row = await AiMessageModel.findOne({
      where: { id: messageId, companyId: tenantId },
      ...aiQueryOptions(),
    });
    return row ? toMessage(row) : null;
  }

  async listMessages(
    tenantId: number,
    conversationId: string,
    options: { page: number; limit: number },
  ): Promise<AiPaginated<AiMessage>> {
    const page = Math.max(1, options.page);
    const limit = Math.min(500, Math.max(1, options.limit));

    const { count, rows } = await AiMessageModel.findAndCountAll({
      where: { companyId: tenantId, conversationId },
      order: [
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ],
      offset: (page - 1) * limit,
      limit,
      ...aiQueryOptions(),
    });

    return paginate(count, rows.map(toMessage), page, limit);
  }

  async saveCitation(citation: AiMessageCitation): Promise<AiMessageCitation> {
    await AiMessageCitationModel.upsert(
      {
        id: citation.id,
        companyId: citation.tenantId,
        messageId: citation.messageId,
        sourceId: citation.sourceId,
        title: citation.title,
        reference: citation.reference,
        chunkId: citation.chunkId,
        score: citation.score,
        createdAt: citation.createdAt,
      },
      aiQueryOptions(),
    );
    return citation;
  }

  async listCitations(tenantId: number, messageId: string): Promise<AiMessageCitation[]> {
    const rows = await AiMessageCitationModel.findAll({
      where: { companyId: tenantId, messageId },
      order: [
        ['score', 'DESC'],
        ['createdAt', 'ASC'],
      ],
      ...aiQueryOptions(),
    });
    return rows.map(toCitation);
  }

  async saveContextSnapshot(snapshot: AiContextSnapshot): Promise<AiContextSnapshot> {
    await AiContextSnapshotModel.upsert(
      {
        id: snapshot.id,
        companyId: snapshot.tenantId,
        interactionId: snapshot.interactionId,
        contextHash: snapshot.contextHash,
        policyVersion: snapshot.policyVersion,
        permissions: [...snapshot.permissions],
        knowledgeSourceIds: [...snapshot.knowledgeSourceIds],
        redactedFields: [...snapshot.redactedFields],
        toolNames: [...snapshot.toolNames],
        createdAt: snapshot.createdAt,
      },
      aiQueryOptions(),
    );
    return snapshot;
  }

  async findContextSnapshot(
    tenantId: number,
    interactionId: string,
  ): Promise<AiContextSnapshot | null> {
    const row = await AiContextSnapshotModel.findOne({
      where: { companyId: tenantId, interactionId },
      ...aiQueryOptions(),
    });
    if (!row) return null;
    return AiContextSnapshot.restore({
      id: row.id,
      tenantId: row.companyId,
      interactionId: row.interactionId,
      policyVersion: row.policyVersion,
      permissions: row.permissions,
      knowledgeSourceIds: row.knowledgeSourceIds,
      redactedFields: row.redactedFields,
      toolNames: row.toolNames,
      contextHash: row.contextHash,
      createdAt: row.createdAt,
    });
  }

  async findMessageByIdempotencyKey(
    tenantId: number,
    conversationId: string,
    idempotencyKey: string,
  ): Promise<AiMessage | null> {
    const row = await AiMessageModel.findOne({
      where: { companyId: tenantId, conversationId, idempotencyKey },
      ...aiQueryOptions(),
    });
    return row ? toMessage(row) : null;
  }

  async countActiveConversations(tenantId: number, userId: number): Promise<number> {
    return AiConversationModel.count({
      where: { companyId: tenantId, userId, status: 'ACTIVE', deletedAt: null },
      ...aiQueryOptions(),
    });
  }
}
