/**
 * Porta do fornecedor de IA (secção 12.2, RF-AI-051 a RF-AI-060,
 * RNF-AI-019).
 *
 * O domínio e a aplicação dependem apenas deste contrato — qualquer
 * fornecedor (OpenAI, Anthropic, modelo local) é substituível sem
 * alterar a orquestração.
 */
export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface AiToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AiModelGenerateInput {
  modelId: string;
  messages: AiChatMessage[];
  tools?: AiToolSchema[];
  temperature?: number;
  maxOutputTokens?: number;
  /** Cancelamento cooperativo (RF-AI-009, RNF-AI-007). */
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface AiModelToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiModelResponse {
  content: string;
  toolCalls?: AiModelToolCall[];
  usage: { inputTokens: number; outputTokens: number; cachedTokens?: number };
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
  modelId: string;
  providerId: string;
  latencyMs: number;
  raw?: unknown;
}

export interface AiModelGatewayPort {
  generate(input: AiModelGenerateInput): Promise<AiModelResponse>;

  /** Modelos activos disponíveis no fornecedor (administração). */
  listModels(): Promise<Array<{ providerId: string; modelId: string; available: boolean }>>;

  /** Estado do circuito breaker do fornecedor (observabilidade). */
  health(providerId: string): Promise<{ available: boolean; reason?: string }>;
}

/**
 * Evolução prevista: streaming (SSE), chamadas de ferramentas
 * nativas, respostas estruturadas e métricas por fornecedor.
 */
export interface AiStreamingModelGatewayPort extends AiModelGatewayPort {
  generateStream(
    input: AiModelGenerateInput,
    onChunk: (chunk: { delta: string; done: boolean }) => void,
  ): Promise<AiModelResponse>;
}
