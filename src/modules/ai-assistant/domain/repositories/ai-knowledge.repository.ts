import { AiKnowledgeSource } from '../aggregates/ai-knowledge-source.aggregate';
import { AiIndexingJob } from '../entities/ai-indexing-job.entity';
import { AiKnowledgeChunk } from '../entities/ai-knowledge-chunk.entity';

export interface AiKnowledgeSearchQuery {
  tenantId: number;
  text: string;
  allowedClassifications: readonly string[];
  includePlatformSources: boolean;
  limit: number;
}

export interface AiKnowledgeSearchResult {
  chunk: AiKnowledgeChunk;
  source: { id: string; name: string; sourceModule: string; scope: string };
  score: number;
}

/**
 * Contrato da pesquisa de conhecimento (secção 13, RF-AI-021 a
 * RF-AI-030).
 *
 * RN-AI-006/RF-AI-029: o filtro de autorização é aplicado DENTRO da
 * consulta — nunca se devolve conteúdo para depois filtrar.
 */
export interface AiKnowledgeRepository {
  saveSource(source: AiKnowledgeSource): Promise<AiKnowledgeSource>;
  findSource(tenantId: number | null, sourceId: string): Promise<AiKnowledgeSource | null>;
  listSources(filter: {
    tenantId: number | null;
    includePlatform: boolean;
    status?: string;
  }): Promise<AiKnowledgeSource[]>;

  saveChunk(chunk: AiKnowledgeChunk): Promise<AiKnowledgeChunk>;
  searchChunks(query: AiKnowledgeSearchQuery): Promise<AiKnowledgeSearchResult[]>;
  listChunks(
    tenantId: number | null,
    filter: { sourceId: string; documentId?: string },
  ): Promise<AiKnowledgeChunk[]>;
  revokeChunks(tenantId: number | null, sourceId: string, reason: string): Promise<number>;
  deleteChunksByDocument(tenantId: number | null, documentId: string): Promise<number>;
  countActiveChunks(tenantId: number | null): Promise<number>;

  saveIndexingJob(job: AiIndexingJob): Promise<AiIndexingJob>;
  findIndexingJobByIdempotencyKey(key: string): Promise<AiIndexingJob | null>;
  listIndexingJobs(filter: {
    tenantId: number | null;
    sourceId?: string;
    status?: string;
    limit: number;
  }): Promise<AiIndexingJob[]>;
}
