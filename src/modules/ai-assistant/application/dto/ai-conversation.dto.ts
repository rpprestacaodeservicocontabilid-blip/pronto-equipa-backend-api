/**
 * Contratos de entrada e saída das conversas (secção 12.1,
 * RF-AI-001 a RF-AI-010).
 *
 * `tenantId` e `userId` NÃO fazem parte do pedido: são obtidos do
 * contexto autenticado.
 */
export interface CreateAiConversationRequest {
  title?: string;
}

export interface SendAiMessageRequest {
  conversationId?: string;
  message: string;
  attachmentIds?: string[];
  idempotencyKey: string;
}

export type SendAiMessageStatus =
  | 'COMPLETED'
  | 'AWAITING_CONFIRMATION'
  | 'AWAITING_APPROVAL'
  | 'FAILED';

export interface AiCitationView {
  sourceId: string;
  title: string;
  reference: string;
}

export interface SendAiMessageResult {
  conversationId: string;
  interactionId: string;
  status: SendAiMessageStatus;
  answer?: string;
  citations?: AiCitationView[];
  /** Ferramentas propostas que aguardam confirmação/aprovação. */
  proposals?: Array<{
    id: string;
    toolName: string;
    riskLevel: string;
    requiresConfirmation: boolean;
    requiresApproval: boolean;
  }>;
  /** Declaração de limitação quando não existe evidência (RN-AI-015). */
  limitation?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface AiMessageView {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  citations: AiCitationView[];
  interactionId: string | null;
}

export interface AiConversationView {
  id: string;
  title: string;
  status: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversationListResult {
  data: AiConversationView[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AiConversationDetail extends AiConversationView {
  messages: AiMessageView[];
}

export interface AiFeedbackRequest {
  rating: number;
  comment?: string;
  category?: string;
}
