/**
 * Porta de pesquisa vectorial/híbrida (secção 13.5).
 *
 * O isolamento é aplicado ANTES de devolver resultados: o filtro de
 * tenant e classificação é parte da consulta, não um passo posterior.
 */
export interface AiVectorSearchQuery {
  tenantId: number;
  vector?: number[] | null;
  text?: string;
  allowedClassifications: readonly string[];
  includePlatformSources: boolean;
  limit: number;
  sourceIds?: readonly string[];
}

export interface AiVectorSearchHit {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  sourceId: string;
  title: string;
  reference: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface AiVectorSearchPort {
  search(query: AiVectorSearchQuery): Promise<AiVectorSearchHit[]>;
  /** Remove segmentos de um documento revogado (RF-AI-026). */
  removeDocument(tenantId: number | null, documentId: string): Promise<number>;
  /** Indexa ou actualiza segmentos (RF-AI-024/025). */
  upsert(chunks: Array<{ id: string; text: string; metadata: Record<string, unknown>; tenantId: number | null }>): Promise<number>;
}
