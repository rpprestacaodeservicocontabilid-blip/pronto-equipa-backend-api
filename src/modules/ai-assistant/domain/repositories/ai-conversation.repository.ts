import { AiConversation } from '../aggregates/ai-conversation.aggregate';
import { AiContextSnapshot } from '../entities/ai-context-snapshot.entity';
import { AiMessage } from '../entities/ai-message.entity';
import { AiMessageCitation } from '../entities/ai-message-citation.entity';

export interface AiConversationListQuery {
  page: number;
  limit: number;
  status?: string;
  search?: string;
  includeDeleted?: boolean;
}

export interface AiPaginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Contrato de persistência das conversas (RF-AI-004/006/007).
 *
 * Todos os métodos exigem `tenantId`: o repositório aplica o filtro
 * de isolamento (e RLS no PostgreSQL) antes de devolver qualquer
 * registos — nunca é aceite um identificador sem contexto de tenant.
 */
export interface AiConversationRepository {
  saveConversation(conversation: AiConversation): Promise<AiConversation>;
  findConversation(
    tenantId: number,
    conversationId: string,
    userId: number,
  ): Promise<AiConversation | null>;
  listConversations(
    tenantId: number,
    userId: number,
    query: AiConversationListQuery,
  ): Promise<AiPaginated<AiConversation>>;

  saveMessage(message: AiMessage): Promise<AiMessage>;
  findMessage(tenantId: number, messageId: string): Promise<AiMessage | null>;
  listMessages(
    tenantId: number,
    conversationId: string,
    options: { page: number; limit: number },
  ): Promise<AiPaginated<AiMessage>>;

  saveCitation(citation: AiMessageCitation): Promise<AiMessageCitation>;
  listCitations(tenantId: number, messageId: string): Promise<AiMessageCitation[]>;

  saveContextSnapshot(snapshot: AiContextSnapshot): Promise<AiContextSnapshot>;
  findContextSnapshot(tenantId: number, interactionId: string): Promise<AiContextSnapshot | null>;

  /** Mensagem idempotente: devolve a existente para a mesma chave. */
  findMessageByIdempotencyKey(
    tenantId: number,
    conversationId: string,
    idempotencyKey: string,
  ): Promise<AiMessage | null>;

  countActiveConversations(tenantId: number, userId: number): Promise<number>;
}
