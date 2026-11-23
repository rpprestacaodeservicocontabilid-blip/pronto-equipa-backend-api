import { Op } from 'sequelize';
import { AiInteraction } from '../../../domain/aggregates/ai-interaction.aggregate';
import { AiFeedback } from '../../../domain/entities/ai-feedback.entity';
import { AiModelInvocation } from '../../../domain/entities/ai-model-invocation.entity';
import type { AiInteractionRepository } from '../../../domain/repositories/ai-interaction.repository';
import type { AiPaginated } from '../../../domain/repositories/ai-conversation.repository';
import {
  AiFeedbackModel,
  AiInteractionModel,
  AiModelInvocationModel,
  type AiInteractionAttributes,
} from '../models/ai-interaction.model';
import { aiQueryOptions } from '../ai-transaction-context';

/** Estados que mantêm uma interacção activa (controlo de concorrência). */
const ACTIVE_STATUSES = [
  'RECEIVED',
  'VALIDATING',
  'AUTHORIZING',
  'BUILDING_CONTEXT',
  'RETRIEVING',
  'GENERATING',
  'TOOL_PENDING',
  'AWAITING_CONFIRMATION',
  'AWAITING_APPROVAL',
  'EXECUTING_TOOL',
];

const paginate = <T>(total: number, data: T[], page: number, limit: number): AiPaginated<T> => ({
  data,
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / Math.max(1, limit))),
});

const toInteraction = (row: AiInteractionModel): AiInteraction =>
  AiInteraction.restore({
    id: row.id,
    tenantId: row.companyId,
    conversationId: row.conversationId,
    userId: row.userId,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    prompt: row.prompt,
    safetyClassification: row.safetyClassification,
    safetyReasons: row.safetyReasons ?? [],
    providerId: row.providerId,
    modelId: row.modelId,
    promptCode: row.promptCode,
    promptVersion: row.promptVersion,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    estimatedCostAmount: Number(row.estimatedCostAmount ?? 0),
    estimatedCostCurrency: row.estimatedCostCurrency,
    toolCallCount: row.toolCallCount,
    citationCount: row.citationCount,
    failureReason: row.failureReason,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const toInvocation = (row: AiModelInvocationModel): AiModelInvocation =>
  AiModelInvocation.restore({
    id: row.id,
    tenantId: row.companyId,
    interactionId: row.interactionId,
    providerId: row.providerId,
    modelId: row.modelId,
    promptCode: row.promptCode,
    promptVersion: row.promptVersion,
    status: row.status as AiModelInvocation['status'],
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    estimatedCostAmount: Number(row.estimatedCostAmount ?? 0),
    estimatedCostCurrency: row.estimatedCostCurrency,
    latencyMs: row.latencyMs,
    fallbackUsed: row.fallbackUsed,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
  });

const toFeedback = (row: AiFeedbackModel): AiFeedback =>
  AiFeedback.restore({
    id: row.id,
    tenantId: row.companyId,
    interactionId: row.interactionId,
    userId: row.userId,
    rating: row.rating as AiFeedback['rating'],
    comment: row.comment,
    category: row.category,
    createdAt: row.createdAt,
  });

/**
 * Implementação Sequelize do contrato de interacções
 * (RF-AI-003/008/009/010/060).
 *
 * A chave de idempotência é única por tenant e conversa: repetir o
 * mesmo pedido devolve a interacção original (CA-AI-018).
 */
export class SequelizeAiInteractionRepository implements AiInteractionRepository {
  async saveInteraction(interaction: AiInteraction): Promise<AiInteraction> {
    const props = interaction.propsSnapshot;
    await AiInteractionModel.upsert(
      {
        id: props.id,
        companyId: props.tenantId,
        conversationId: props.conversationId,
        userId: props.userId,
        status: props.status,
        idempotencyKey: props.idempotencyKey,
        prompt: props.prompt,
        safetyClassification: props.safetyClassification,
        safetyReasons: props.safetyReasons,
        providerId: props.providerId,
        modelId: props.modelId,
        promptCode: props.promptCode,
        promptVersion: props.promptVersion,
        inputTokens: props.inputTokens,
        outputTokens: props.outputTokens,
        estimatedCostAmount: props.estimatedCostAmount,
        estimatedCostCurrency: props.estimatedCostCurrency,
        toolCallCount: props.toolCallCount,
        citationCount: props.citationCount,
        failureReason: props.failureReason,
        startedAt: props.startedAt,
        completedAt: props.completedAt,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      aiQueryOptions(),
    );
    return interaction;
  }

  async findInteraction(tenantId: number, interactionId: string): Promise<AiInteraction | null> {
    const row = await AiInteractionModel.findOne({
      where: { id: interactionId, companyId: tenantId },
      ...aiQueryOptions(),
    });
    return row ? toInteraction(row) : null;
  }

  async findByIdempotencyKey(
    tenantId: number,
    conversationId: string,
    idempotencyKey: string,
  ): Promise<AiInteraction | null> {
    const row = await AiInteractionModel.findOne({
      where: { companyId: tenantId, conversationId, idempotencyKey },
      ...aiQueryOptions(),
    });
    return row ? toInteraction(row) : null;
  }

  async listInteractions(
    tenantId: number,
    query: { conversationId?: string; userId?: number; page: number; limit: number },
  ): Promise<AiPaginated<AiInteraction>> {
    const page = Math.max(1, query.page);
    const limit = Math.min(200, Math.max(1, query.limit));
    const where: WhereFilter = { companyId: tenantId };
    if (query.conversationId) where.conversationId = query.conversationId;
    if (query.userId) where.userId = query.userId;

    const { count, rows } = await AiInteractionModel.findAndCountAll({
      where,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      offset: (page - 1) * limit,
      limit,
      ...aiQueryOptions(),
    });

    return paginate(count, rows.map(toInteraction), page, limit);
  }

  async saveModelInvocation(invocation: AiModelInvocation): Promise<AiModelInvocation> {
    await AiModelInvocationModel.upsert(
      {
        id: invocation.id,
        companyId: invocation.tenantId,
        interactionId: invocation.interactionId,
        providerId: invocation.providerId,
        modelId: invocation.modelId,
        promptCode: invocation.promptCode,
        promptVersion: invocation.promptVersion,
        status: invocation.status,
        inputTokens: invocation.inputTokens,
        outputTokens: invocation.outputTokens,
        estimatedCostAmount: invocation.estimatedCostAmount,
        estimatedCostCurrency: invocation.estimatedCostCurrency,
        latencyMs: invocation.latencyMs,
        fallbackUsed: invocation.fallbackUsed,
        errorCode: invocation.errorCode,
        createdAt: invocation.createdAt,
      },
      aiQueryOptions(),
    );
    return invocation;
  }

  async listModelInvocations(
    tenantId: number,
    interactionId: string,
  ): Promise<AiModelInvocation[]> {
    const rows = await AiModelInvocationModel.findAll({
      where: { companyId: tenantId, interactionId },
      order: [['createdAt', 'ASC']],
      ...aiQueryOptions(),
    });
    return rows.map(toInvocation);
  }

  async saveFeedback(feedback: AiFeedback): Promise<AiFeedback> {
    await AiFeedbackModel.upsert(
      {
        id: feedback.id,
        companyId: feedback.tenantId,
        interactionId: feedback.interactionId,
        userId: feedback.userId,
        rating: feedback.rating,
        comment: feedback.comment,
        category: feedback.category,
        createdAt: feedback.createdAt,
      },
      aiQueryOptions(),
    );
    return feedback;
  }

  async findFeedback(
    tenantId: number,
    interactionId: string,
    userId: number,
  ): Promise<AiFeedback | null> {
    const row = await AiFeedbackModel.findOne({
      where: { companyId: tenantId, interactionId, userId },
      ...aiQueryOptions(),
    });
    return row ? toFeedback(row) : null;
  }

  async countActiveInteractions(tenantId: number, userId: number): Promise<number> {
    return AiInteractionModel.count({
      where: {
        companyId: tenantId,
        userId,
        status: { [Op.in]: ACTIVE_STATUSES },
      },
      ...aiQueryOptions(),
    });
  }
}

/** Filtro de interacções por coluna (tipado contra o modelo). */
type WhereFilter = Partial<Pick<AiInteractionAttributes, 'conversationId' | 'userId'>> & {
  companyId: number;
};
