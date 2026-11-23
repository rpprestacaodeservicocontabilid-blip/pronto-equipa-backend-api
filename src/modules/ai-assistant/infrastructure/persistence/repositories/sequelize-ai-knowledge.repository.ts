import { Op } from 'sequelize';
import { AiKnowledgeSource } from '../../../domain/aggregates/ai-knowledge-source.aggregate';
import { AiIndexingJob } from '../../../domain/entities/ai-indexing-job.entity';
import { AiKnowledgeChunk } from '../../../domain/entities/ai-knowledge-chunk.entity';
import type {
  AiKnowledgeRepository,
  AiKnowledgeSearchQuery,
  AiKnowledgeSearchResult,
} from '../../../domain/repositories/ai-knowledge.repository';
import {
  AiIndexingJobModel,
  AiKnowledgeChunkModel,
  AiKnowledgeSourceModel,
} from '../models/ai-knowledge.model';
import { aiQueryOptions } from '../ai-transaction-context';

const toSource = (row: AiKnowledgeSourceModel): AiKnowledgeSource =>
  AiKnowledgeSource.restore({
    id: row.id,
    scope: row.scope as AiKnowledgeSource['scope'],
    tenantId: row.companyId,
    sourceType: row.sourceType,
    referenceId: row.referenceId,
    name: row.name,
    classification: row.classification,
    sourceModule: row.sourceModule,
    status: row.status as AiKnowledgeSource['status'],
    accessPolicyVersion: row.accessPolicyVersion,
    documentCount: row.documentCount,
    chunkCount: row.chunkCount,
    lastIndexedAt: row.lastIndexedAt,
    revokedAt: row.revokedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const toChunk = (row: AiKnowledgeChunkModel): AiKnowledgeChunk =>
  AiKnowledgeChunk.restore({
    id: row.id,
    tenantId: row.companyId,
    scope: row.scope as AiKnowledgeChunk['scope'],
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    classification: row.classification,
    sourceModule: row.sourceModule,
    content: row.content,
    sequence: row.sequence,
    accessPolicyVersion: row.accessPolicyVersion,
    sourceId: row.sourceId,
    status: row.status as AiKnowledgeChunk['status'],
    indexedAt: row.indexedAt,
  });

const toJob = (row: AiIndexingJobModel): AiIndexingJob =>
  AiIndexingJob.restore({
    id: row.id,
    tenantId: row.companyId,
    sourceId: row.sourceId,
    kind: row.kind as AiIndexingJob['kind'],
    documentId: row.documentId,
    idempotencyKey: row.idempotencyKey,
    status: row.status as AiIndexingJob['status'],
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    lastError: row.lastError,
    nextAttemptAt: row.nextAttemptAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

/** Pontuação simples de relevância por palavras-chave (0 a 1). */
const scoreOf = (content: string, terms: readonly string[]): number => {
  if (!terms.length) return 0;
  const haystack = content.toLowerCase();
  const hits = terms.reduce(
    (sum, term) => sum + (term ? haystack.split(term).length - 1 : 0),
    0,
  );
  return Math.min(1, hits / Math.max(1, terms.length * 2));
};

/**
 * Implementação Sequelize da pesquisa de conhecimento
 * (secção 13, RF-AI-021 a RF-AI-030).
 *
 * RN-AI-006: o filtro de autorização (tenant + classificação +
 * âmbito) é aplicado DENTRO da consulta — nunca se devolve conteúdo
 * para depois filtrar.
 */
export class SequelizeAiKnowledgeRepository implements AiKnowledgeRepository {
  // ------------------------------------------------------------
  // Fontes
  // ------------------------------------------------------------

  async saveSource(source: AiKnowledgeSource): Promise<AiKnowledgeSource> {
    const props = source.propsSnapshot;
    await AiKnowledgeSourceModel.upsert(
      {
        id: props.id,
        scope: props.scope,
        companyId: props.tenantId,
        sourceType: props.sourceType,
        referenceId: props.referenceId,
        name: props.name,
        classification: props.classification,
        sourceModule: props.sourceModule,
        status: props.status,
        accessPolicyVersion: props.accessPolicyVersion,
        documentCount: props.documentCount,
        chunkCount: props.chunkCount,
        lastIndexedAt: props.lastIndexedAt,
        revokedAt: props.revokedAt,
        lastError: props.lastError,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      aiQueryOptions(),
    );
    return source;
  }

  async findSource(
    tenantId: number | null,
    sourceId: string,
  ): Promise<AiKnowledgeSource | null> {
    const where: Record<string, unknown> = { id: sourceId };
    if (tenantId !== null) where.companyId = { [Op.or]: [tenantId, null] };

    const row = await AiKnowledgeSourceModel.findOne({ where, ...aiQueryOptions() });
    return row ? toSource(row) : null;
  }

  async listSources(filter: {
    tenantId: number | null;
    includePlatform: boolean;
    status?: string;
  }): Promise<AiKnowledgeSource[]> {
    const where: Record<string, unknown> = {};
    if (filter.status) where.status = filter.status;

    if (filter.tenantId === null) {
      if (!filter.includePlatform) where.companyId = { [Op.ne]: null };
    } else {
      Object.assign(where, {
        [Op.or]: filter.includePlatform
          ? [{ companyId: filter.tenantId }, { companyId: null }]
          : [{ companyId: filter.tenantId }],
      });
    }

    const rows = await AiKnowledgeSourceModel.findAll({
      where,
      order: [
        ['name', 'ASC'],
        ['createdAt', 'ASC'],
      ],
      ...aiQueryOptions(),
    });
    return rows.map(toSource);
  }

  // ------------------------------------------------------------
  // Segmentos
  // ------------------------------------------------------------

  async saveChunk(chunk: AiKnowledgeChunk): Promise<AiKnowledgeChunk> {
    await AiKnowledgeChunkModel.upsert(
      {
        id: chunk.id,
        companyId: chunk.tenantId,
        scope: chunk.scope,
        documentId: chunk.documentId,
        documentVersionId: chunk.documentVersionId,
        classification: chunk.classification,
        sourceModule: chunk.sourceModule,
        content: chunk.content,
        sequence: chunk.sequence,
        accessPolicyVersion: chunk.accessPolicyVersion,
        sourceId: chunk.sourceId,
        indexedAt: chunk.indexedAt,
        status: chunk.status,
      },
      aiQueryOptions(),
    );
    return chunk;
  }

  async searchChunks(query: AiKnowledgeSearchQuery): Promise<AiKnowledgeSearchResult[]> {
    const terms = String(query.text ?? '')
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3)
      .slice(0, 8);

    const where: Record<string, unknown> = {
      status: 'ACTIVE',
      classification: { [Op.in]: [...query.allowedClassifications] },
    };

    // Âmbito: fontes de plataforma quando permitido, sempre as do tenant.
    const scopeFilter: Record<string, unknown>[] = [{ companyId: query.tenantId }];
    if (query.includePlatformSources) scopeFilter.push({ scope: 'PLATFORM' });
    Object.assign(where, { [Op.or]: scopeFilter });

    // Restrição às fontes activas (uma fonte revogada nunca devolve conteúdo).
    const activeSources = await AiKnowledgeSourceModel.findAll({
      where: { status: 'ACTIVE' },
      ...aiQueryOptions(),
    });
    where.sourceId = { [Op.in]: activeSources.map((row) => row.id) };

    if (terms.length)
      Object.assign(where, {
        [Op.and]: terms.map((term) => ({ content: { [Op.like]: `%${term}%` } })),
      });

    const rows = await AiKnowledgeChunkModel.findAll({
      where,
      order: [
        ['indexedAt', 'DESC'],
        ['sequence', 'ASC'],
      ],
      limit: Math.min(50, Math.max(1, query.limit)),
      ...aiQueryOptions(),
    });

    const results: AiKnowledgeSearchResult[] = [];
    for (const row of rows) {
      const sourceRow = activeSources.find((candidate) => candidate.id === row.sourceId);
      if (!sourceRow) continue;
      results.push({
        chunk: toChunk(row),
        source: {
          id: sourceRow.id,
          name: sourceRow.name,
          sourceModule: sourceRow.sourceModule,
          scope: sourceRow.scope,
        },
        score: scoreOf(row.content, terms),
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, query.limit);
  }

  async listChunks(
    tenantId: number | null,
    filter: { sourceId: string; documentId?: string },
  ): Promise<AiKnowledgeChunk[]> {
    const where: Record<string, unknown> = { sourceId: filter.sourceId };
    if (filter.documentId) where.documentId = filter.documentId;
    if (tenantId !== null) where.companyId = { [Op.or]: [tenantId, null] };

    const rows = await AiKnowledgeChunkModel.findAll({
      where,
      order: [
        ['documentId', 'ASC'],
        ['sequence', 'ASC'],
      ],
      ...aiQueryOptions(),
    });
    return rows.map(toChunk);
  }

  async revokeChunks(
    tenantId: number | null,
    sourceId: string,
    _reason: string,
  ): Promise<number> {
    const where: Record<string, unknown> = { sourceId, status: 'ACTIVE' };
    if (tenantId !== null) where.companyId = { [Op.or]: [tenantId, null] };

    const [count] = await AiKnowledgeChunkModel.update(
      { status: 'REVOKED' },
      { where, ...aiQueryOptions() },
    );
    return count;
  }

  async deleteChunksByDocument(tenantId: number | null, documentId: string): Promise<number> {
    const where: Record<string, unknown> = { documentId };
    if (tenantId !== null) where.companyId = { [Op.or]: [tenantId, null] };

    return AiKnowledgeChunkModel.destroy({ where, ...aiQueryOptions() });
  }

  async countActiveChunks(tenantId: number | null): Promise<number> {
    const where: Record<string, unknown> = { status: 'ACTIVE' };
    if (tenantId !== null)
      Object.assign(where, { [Op.or]: [{ companyId: tenantId }, { companyId: null }] });

    return AiKnowledgeChunkModel.count({ where, ...aiQueryOptions() });
  }

  // ------------------------------------------------------------
  // Trabalhos de indexação
  // ------------------------------------------------------------

  async saveIndexingJob(job: AiIndexingJob): Promise<AiIndexingJob> {
    await AiIndexingJobModel.upsert(
      {
        id: job.id,
        companyId: job.tenantId,
        sourceId: job.sourceId,
        kind: job.kind,
        documentId: job.documentId,
        idempotencyKey: job.idempotencyKey,
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        lastError: job.lastError,
        nextAttemptAt: job.nextAttemptAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
      aiQueryOptions(),
    );
    return job;
  }

  async findIndexingJobByIdempotencyKey(key: string): Promise<AiIndexingJob | null> {
    const row = await AiIndexingJobModel.findOne({
      where: { idempotencyKey: key },
      ...aiQueryOptions(),
    });
    return row ? toJob(row) : null;
  }

  async listIndexingJobs(filter: {
    tenantId: number | null;
    sourceId?: string;
    status?: string;
    limit: number;
  }): Promise<AiIndexingJob[]> {
    const where: Record<string, unknown> = {};
    if (filter.tenantId !== null) where.companyId = filter.tenantId;
    if (filter.sourceId) where.sourceId = filter.sourceId;
    if (filter.status) where.status = filter.status;

    const rows = await AiIndexingJobModel.findAll({
      where,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: Math.min(500, Math.max(1, filter.limit)),
      ...aiQueryOptions(),
    });
    return rows.map(toJob);
  }
}
