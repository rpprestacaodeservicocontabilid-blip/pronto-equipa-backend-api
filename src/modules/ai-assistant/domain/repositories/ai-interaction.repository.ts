import { AiInteraction } from '../aggregates/ai-interaction.aggregate';
import { AiFeedback } from '../entities/ai-feedback.entity';
import { AiModelInvocation } from '../entities/ai-model-invocation.entity';
import { AiPaginated } from './ai-conversation.repository';

/**
 * Contrato de persistência das interacções (RF-AI-003/008/009/010,
 * RF-AI-060).
 *
 * A chave de idempotência é única por tenant e conversa — repetições
 * do mesmo pedido devolvem a interacção original (CA-AI-018).
 */
export interface AiInteractionRepository {
  saveInteraction(interaction: AiInteraction): Promise<AiInteraction>;
  findInteraction(tenantId: number, interactionId: string): Promise<AiInteraction | null>;
  findByIdempotencyKey(
    tenantId: number,
    conversationId: string,
    idempotencyKey: string,
  ): Promise<AiInteraction | null>;
  listInteractions(
    tenantId: number,
    query: { conversationId?: string; userId?: number; page: number; limit: number },
  ): Promise<AiPaginated<AiInteraction>>;

  saveModelInvocation(invocation: AiModelInvocation): Promise<AiModelInvocation>;
  listModelInvocations(tenantId: number, interactionId: string): Promise<AiModelInvocation[]>;

  saveFeedback(feedback: AiFeedback): Promise<AiFeedback>;
  findFeedback(
    tenantId: number,
    interactionId: string,
    userId: number,
  ): Promise<AiFeedback | null>;

  /** Interacções activas de um tenant (controlo de concorrência). */
  countActiveInteractions(tenantId: number, userId: number): Promise<number>;
}
