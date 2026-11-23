/**
 * Porta de geração de embeddings (secção 13.5, RF-AI-024).
 *
 * Os embeddings são tratados como dados potencialmente sensíveis:
 * nunca são registados em logs nem enviados fora do âmbito permitido.
 */
export interface AiEmbeddingInput {
  texts: string[];
  modelId?: string;
  tenantId: number | null;
}

export interface AiEmbeddingResult {
  vectors: number[][];
  modelId: string;
  dimensions: number;
  usage: { inputTokens: number };
}

export interface AiEmbeddingGatewayPort {
  embed(input: AiEmbeddingInput): Promise<AiEmbeddingResult>;
  /** Dimensão esperada pelo vector store configurado. */
  dimensions(): number;
}
