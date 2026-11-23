import { randomUUID } from 'crypto';
import { AI_EVENTS } from '../../domain/events/ai-domain.event';
import { AiIndexingJob } from '../../domain/entities/ai-indexing-job.entity';
import { AiKnowledgeChunk } from '../../domain/entities/ai-knowledge-chunk.entity';
import { AiKnowledgeSource } from '../../domain/aggregates/ai-knowledge-source.aggregate';
import { AiNotFoundError } from '../../domain/errors/ai-domain.error';
import type {
  AiKnowledgeRepository,
  AiKnowledgeSearchResult,
} from '../../domain/repositories/ai-knowledge.repository';
import type { AiEmbeddingGatewayPort } from '../ports/ai-embedding-gateway.port';
import type { AiVectorSearchPort, AiVectorSearchHit } from '../ports/ai-vector-search.port';
import type { AiDocumentReaderPort } from '../ports/ai-document-reader.port';
import type { AiAuditPort } from '../ports/ai-audit.port';
import type { EventPublisherPort } from '../ports/event-publisher.port';
import type {
  AiIndexingJobView,
  AiKnowledgeSearchView,
  AiKnowledgeSourceView,
} from '../dto/ai-admin.dto';
import { AiActorContext, AiContextService, AiAuthorizedContext } from './context.service';
import { AiSafetyService } from './safety.service';
import { chunkSnippet, toJobView, toSourceView } from './ai-views';

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;
const MAX_QUERY_CHARS = 500;

interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  title: string;
  reference: string;
  content: string;
  score: number;
  sourceId: string;
  sourceName: string;
}

/**
 * Casos de uso de conhecimento (secção 13, RF-AI-021 a RF-AI-030).
 *
 * O filtro de tenant e classificação é aplicado DENTRO da consulta
 * (RN-AI-006/RF-AI-029); a revogação propaga-se aos segmentos já
 * indexados (RF-AI-026).
 */
export class AiKnowledgeService {
  constructor(
    private readonly knowledge: AiKnowledgeRepository,
    private readonly vector: AiVectorSearchPort,
    private readonly embeddings: AiEmbeddingGatewayPort,
    private readonly documents: AiDocumentReaderPort,
    private readonly contextService: AiContextService,
    private readonly safety: AiSafetyService,
    private readonly audit: AiAuditPort,
    private readonly events: EventPublisherPort,
  ) {}

  // ------------------------------------------------------------
  // Fontes
  // ------------------------------------------------------------

  async listSources(
    actor: AiActorContext,
    options: { includePlatform?: boolean } = {},
  ): Promise<AiKnowledgeSourceView[]> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:knowledge:read');

    const sources = await this.knowledge.listSources({
      tenantId: actor.tenantId,
      includePlatform: options.includePlatform ?? true,
    });
    return sources.map(toSourceView);
  }

  async registerSource(
    actor: AiActorContext,
    input: {
      name: string;
      sourceType?: string;
      referenceId?: string | null;
      classification?: string;
      sourceModule?: string;
      scope?: 'PLATFORM' | 'TENANT';
    },
  ): Promise<AiKnowledgeSourceView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:knowledge:manage');

    const source = AiKnowledgeSource.register({
      scope: input.scope ?? 'TENANT',
      tenantId: actor.tenantId,
      sourceType: input.sourceType ?? 'DOCUMENT',
      referenceId: input.referenceId ?? null,
      name: input.name,
      classification: input.classification,
      sourceModule: input.sourceModule ?? 'ai-assistant',
    });
    await this.knowledge.saveSource(source);

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action: 'ai-knowledge.source.registered',
      entityType: 'ai_knowledge_source',
      entityId: source.id,
      correlationId: actor.requestId ?? null,
      after: { name: source.name, classification: source.classification },
    });

    return toSourceView(source);
  }

  /** Revogação de uma fonte e dos seus segmentos (RF-AI-026). */
  async revokeSource(
    actor: AiActorContext,
    sourceId: string,
    reason: string,
  ): Promise<AiKnowledgeSourceView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:knowledge:manage');

    const source = await this.knowledge.findSource(actor.tenantId, sourceId);
    if (!source) throw new AiNotFoundError('Fonte de conhecimento indisponível.');

    source.revoke(reason);
    await this.knowledge.saveSource(source);
    const removed = await this.knowledge.revokeChunks(actor.tenantId, sourceId, reason);
    await this.vector.removeDocument(actor.tenantId, sourceId);

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action: 'ai-knowledge.source.revoked',
      entityType: 'ai_knowledge_source',
      entityId: sourceId,
      before: { status: 'ACTIVE' },
      after: { status: 'REVOKED', removedChunks: removed },
    });

    return toSourceView(source);
  }

  // ------------------------------------------------------------
  // Recuperação (RAG)
  // ------------------------------------------------------------

  /**
   * Recupera evidência autorizada para uma pergunta. O resultado é
   * sempre filtrado por âmbito, classificação e segurança antes de
   * chegar ao modelo (RN-AI-006, RN-AI-021).
   */
  async retrieve(
    context: AiAuthorizedContext,
    query: string,
    limit = 6,
  ): Promise<RetrievedChunk[]> {
    if (context.policy.knowledgeScope === 'NONE') return [];
    const text = String(query ?? '').trim().slice(0, MAX_QUERY_CHARS);
    if (!text) return [];

    const base = {
      tenantId: context.actor.tenantId,
      allowedClassifications: context.policy.allowedClassifications,
      includePlatformSources: true,
      limit: Math.min(20, Math.max(1, limit)),
    };

    const merged = new Map<string, RetrievedChunk>();

    const keyword = await this.knowledge.searchChunks({ ...base, text });
    for (const hit of keyword) this.admit(merged, hit, hit.score);

    // A pesquisa vectorial é opcional: quando o vector store não está
    // disponível, a pesquisa por texto garante o funcionamento.
    try {
      const embedded = await this.embeddings.embed({
        texts: [text],
        tenantId: context.actor.tenantId,
      });
      const vectorHits = await this.vector.search({
        ...base,
        vector: embedded.vectors[0] ?? null,
        text,
      });
      for (const hit of vectorHits) this.admitVector(merged, hit);
    } catch {
      // Vector store indisponível — não é um erro de negócio.
    }
    return [...merged.values()]
      .filter((item) => !this.safety.evaluateRetrieved(item.content).blocked)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** Vista pronta para apresentação de uma pesquisa de conhecimento. */
  async search(
    actor: AiActorContext,
    query: string,
    limit = 10,
  ): Promise<AiKnowledgeSearchView[]> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:knowledge:read');
    const results = await this.retrieve(context, query, limit);
    return results.map((result) => ({
      title: result.title,
      reference: result.reference,
      snippet: chunkSnippet(result.content),
      score: result.score,
      sourceId: result.sourceId,
      sourceName: result.sourceName,
    }));
  }

  private admit(
    target: Map<string, RetrievedChunk>,
    hit: AiKnowledgeSearchResult,
    score: number,
  ): void {
    const existing = target.get(hit.chunk.id);
    if (existing && existing.score >= score) return;
    target.set(hit.chunk.id, {
      chunkId: hit.chunk.id,
      documentId: hit.chunk.documentId,
      title: hit.source.name,
      reference: `${hit.source.sourceModule}:${hit.chunk.documentId}#${hit.chunk.sequence}`,
      content: hit.chunk.content,
      score,
      sourceId: hit.source.id,
      sourceName: hit.source.name,
    });
  }

  private admitVector(target: Map<string, RetrievedChunk>, hit: AiVectorSearchHit): void {
    const existing = target.get(hit.chunkId);
    if (existing && existing.score >= hit.score) return;
    target.set(hit.chunkId, {
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      title: hit.title,
      reference: hit.reference,
      content: hit.content,
      score: hit.score,
      sourceId: hit.sourceId,
      sourceName: hit.title,
    });
  }

  // ------------------------------------------------------------
  // Indexação
  // ------------------------------------------------------------

  async enqueueIndexing(
    actor: AiActorContext,
    input: {
      sourceId: string;
      kind?: 'INDEX' | 'REINDEX' | 'REVOKE';
      documentId?: string | null;
      idempotencyKey: string;
    },
  ): Promise<AiIndexingJobView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:knowledge:manage');

    const source = await this.knowledge.findSource(actor.tenantId, input.sourceId);
    if (!source) throw new AiNotFoundError('Fonte de conhecimento indisponível.');

    const existing = await this.knowledge.findIndexingJobByIdempotencyKey(input.idempotencyKey);
    if (existing) return toJobView(existing);

    const job = AiIndexingJob.create({
      tenantId: actor.tenantId,
      sourceId: input.sourceId,
      kind: input.kind ?? 'INDEX',
      documentId: input.documentId ?? null,
      idempotencyKey: input.idempotencyKey,
    });
    await this.knowledge.saveIndexingJob(job);
    return toJobView(job);
  }

  async listIndexingJobs(
    actor: AiActorContext,
    filter: { sourceId?: string; status?: string; limit?: number } = {},
  ): Promise<AiIndexingJobView[]> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:knowledge:read');

    const jobs = await this.knowledge.listIndexingJobs({
      tenantId: actor.tenantId,
      sourceId: filter.sourceId,
      status: filter.status,
      limit: Math.min(200, Math.max(1, Number(filter.limit) || 50)),
    });
    return jobs.map(toJobView);
  }

  /**
   * Executa um trabalho de indexação. O `actorId` é usado apenas
   * para a verificação de acesso do módulo proprietário de
   * documentos — a identidade não é aceite como prova pelo modelo.
   */
  async runIndexingJob(job: AiIndexingJob, actorId: number): Promise<AiIndexingJob> {
    const source = await this.knowledge.findSource(job.tenantId, job.sourceId);
    if (!source) {
      const failed = job.scheduleRetry('Fonte de conhecimento inexistente.');
      return this.knowledge.saveIndexingJob(failed);
    }

    try {
      if (job.kind === 'REVOKE') {
        const removed = await this.knowledge.revokeChunks(
          job.tenantId,
          source.id,
          'Revogação solicitada.',
        );
        await this.vector.removeDocument(job.tenantId, source.id);
        source.revoke('Revogação solicitada por indexação.');
        await this.knowledge.saveSource(source);
        await this.publishRevoked(source, removed);
      } else {
        await this.indexSource(job, source, actorId);
      }

      return this.knowledge.saveIndexingJob(
        AiIndexingJob.restore({
          ...jobToProps(job),
          status: 'SUCCEEDED',
          attempts: job.attempts + 1,
          lastError: null,
          nextAttemptAt: null,
        }),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Falha de indexação.';
      const failed = job.scheduleRetry(reason);
      await this.knowledge.saveIndexingJob(failed);
      source.markFailed(reason);
      await this.knowledge.saveSource(source);
      return failed;
    }
  }

  /**
   * Lê os documentos autorizados do módulo de origem, divide-os em
   * segmentos e projeta-os no vector store.
   *
   * `tenantId = 0` representa o âmbito de plataforma: o lector de
   * documentos trata-o como ausência de restrição de empresa.
   */
  private async indexSource(
    job: AiIndexingJob,
    source: AiKnowledgeSource,
    actorId: number,
  ): Promise<void> {
    const tenantId = job.tenantId ?? 0;
    const documents: Array<{
      id: string;
      title: string;
      version: string;
      content: string;
      classification: string;
      reference: string;
    }> = [];

    if (job.documentId) {
      const document = await this.documents.read({
        tenantId,
        actorId,
        documentId: job.documentId,
      });
      if (document) documents.push(document);
    } else {
      documents.push(
        ...(await this.documents.search({
          tenantId,
          actorId,
          query: source.name,
          limit: 20,
        })),
      );
    }

    let chunkCount = 0;
    for (const document of documents) {
      chunkCount += await this.indexDocument(source, document);
    }

    source.markIndexed({ documents: documents.length, chunks: chunkCount });
    await this.knowledge.saveSource(source);
    await this.events.publish({
      eventName: AI_EVENTS.KNOWLEDGE_INDEXED,
      aggregateId: source.id,
      tenantId: source.tenantId,
      userId: null,
      occurredAt: new Date(),
      payload: { sourceId: source.id, documents: documents.length, chunks: chunkCount },
    });
  }

  /** Remove segmentos de um documento revogado no módulo de origem. */
  async onDocumentRevoked(tenantId: number | null, documentId: string): Promise<number> {
    const removed = await this.knowledge.deleteChunksByDocument(tenantId, documentId);
    await this.vector.removeDocument(tenantId, documentId);
    return removed;
  }

  private async indexDocument(
    source: AiKnowledgeSource,
    document: { id: string; title: string; version: string; content: string; classification: string; reference: string },
  ): Promise<number> {
    const parts = AiKnowledgeService.split(document.content);
    let count = 0;

    for (const [sequence, text] of parts.entries()) {
      const chunk = AiKnowledgeChunk.create({
        tenantId: source.tenantId,
        scope: source.scope,
        documentId: document.id,
        documentVersionId: document.version,
        classification: document.classification,
        sourceModule: source.sourceModule,
        content: text,
        sequence,
        accessPolicyVersion: source.accessPolicyVersion,
        sourceId: source.id,
      });
      await this.knowledge.saveChunk(chunk);
      count += 1;
    }

    try {
      await this.embeddings.embed({ texts: parts, tenantId: source.tenantId });
      await this.vector.upsert(
        parts.map((text, index) => ({
          id: `${document.id}:${index}`,
          text,
          tenantId: source.tenantId,
          metadata: {
            sourceId: source.id,
            documentId: document.id,
            title: document.title,
            reference: document.reference,
            classification: document.classification,
          },
        })),
      );
    } catch {
      // Vector store opcional: a indexação por texto continua válida.
    }

    return count;
  }

  /** Divisão simples em segmentos com sobreposição. */
  static split(content: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
    const text = String(content ?? '').trim();
    if (!text) return [];
    if (text.length <= size) return [text];

    const parts: string[] = [];
    let cursor = 0;
    while (cursor < text.length) {
      const end = Math.min(text.length, cursor + size);
      parts.push(text.slice(cursor, end).trim());
      if (end >= text.length) break;
      cursor = Math.max(end - overlap, cursor + 1);
    }
    return parts.filter((part) => part.length > 0);
  }

  private async publishRevoked(source: AiKnowledgeSource, removed: number): Promise<void> {
    await this.events.publish({
      eventName: AI_EVENTS.KNOWLEDGE_REVOKED,
      aggregateId: source.id,
      tenantId: source.tenantId,
      userId: null,
      occurredAt: new Date(),
      payload: { sourceId: source.id, removedChunks: removed },
    });
  }
}

function jobToProps(job: AiIndexingJob): {
  id: string;
  tenantId: number | null;
  sourceId: string;
  kind: 'INDEX' | 'REINDEX' | 'REVOKE';
  documentId: string | null;
  idempotencyKey: string;
  maxAttempts: number;
  createdAt: Date;
} {
  return {
    id: job.id || randomUUID(),
    tenantId: job.tenantId,
    sourceId: job.sourceId,
    kind: job.kind,
    documentId: job.documentId,
    idempotencyKey: job.idempotencyKey,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt,
  };
}

export type { RetrievedChunk };
