import { randomUUID } from 'crypto';
import { AiValidationError } from '../errors/ai-domain.error';

export const AI_INDEXING_JOB_STATUSES = [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;
export type AiIndexingJobStatus = (typeof AI_INDEXING_JOB_STATUSES)[number];

export interface CreateAiIndexingJobInput {
  tenantId: number | null;
  sourceId: string;
  kind: 'INDEX' | 'REINDEX' | 'REVOKE';
  documentId?: string | null;
  idempotencyKey: string;
  maxAttempts?: number;
  id?: string;
  now?: Date;
}

/**
 * Trabalho de indexação de conhecimento (RF-AI-024/025/026).
 *
 * Invariantes:
 *  - idempotente por chave — execuções concorrentes não duplicam
 *    segmentos (CA-AI-026);
 *  - tentativas limitadas com backoff exponencial;
 *  - falhas permanentes ficam registadas para observabilidade.
 */
export class AiIndexingJob {
  readonly id: string;
  readonly tenantId: number | null;
  readonly sourceId: string;
  readonly kind: 'INDEX' | 'REINDEX' | 'REVOKE';
  readonly documentId: string | null;
  readonly idempotencyKey: string;
  readonly status: AiIndexingJobStatus;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastError: string | null;
  readonly nextAttemptAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(
    input: CreateAiIndexingJobInput & {
      kind: 'INDEX' | 'REINDEX' | 'REVOKE';
      status: AiIndexingJobStatus;
      attempts: number;
      maxAttempts: number;
      lastError: string | null;
      nextAttemptAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ) {
    this.id = input.id ?? randomUUID();
    this.tenantId = input.tenantId;
    this.sourceId = input.sourceId;
    this.kind = input.kind;
    this.documentId = input.documentId ?? null;
    this.idempotencyKey = input.idempotencyKey;
    this.status = input.status;
    this.attempts = input.attempts;
    this.maxAttempts = input.maxAttempts;
    this.lastError = input.lastError;
    this.nextAttemptAt = input.nextAttemptAt;
    this.createdAt = input.createdAt;
    this.updatedAt = input.updatedAt;
  }

  static create(input: CreateAiIndexingJobInput): AiIndexingJob {
    if (!input.sourceId) throw new AiValidationError('Fonte de conhecimento obrigatória.');
    if (!input.idempotencyKey || input.idempotencyKey.length < 8)
      throw new AiValidationError('Chave de idempotência de indexação inválida.');

    const kind = String(input.kind ?? '').toUpperCase();
    if (kind !== 'INDEX' && kind !== 'REINDEX' && kind !== 'REVOKE')
      throw new AiValidationError(`Tipo de indexação inválido: ${input.kind}.`);

    const maxAttempts = input.maxAttempts ?? 5;
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10)
      throw new AiValidationError('Tentativas máximas inválidas.');

    const now = input.now ?? new Date();
    return new AiIndexingJob({
      ...input,
      kind,
      status: 'PENDING',
      attempts: 0,
      maxAttempts,
      lastError: null,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(
    props: CreateAiIndexingJobInput & {
      kind: 'INDEX' | 'REINDEX' | 'REVOKE';
      status: AiIndexingJobStatus;
      attempts: number;
      maxAttempts: number;
      lastError?: string | null;
      nextAttemptAt?: Date | null;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ): AiIndexingJob {
    const now = props.createdAt ?? new Date();
    return new AiIndexingJob({
      ...props,
      lastError: props.lastError ?? null,
      nextAttemptAt: props.nextAttemptAt ?? null,
      createdAt: now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  get canRetry(): boolean {
    return this.status === 'FAILED' && this.attempts < this.maxAttempts;
  }

  /** Próxima tentativa com backoff exponencial (base 2, máx. 15 min). */
  scheduleRetry(error: string, now = new Date()): AiIndexingJob {
    if (this.attempts >= this.maxAttempts) return this;
    const delayMs = Math.min(2 ** this.attempts * 1000, 15 * 60_000);
    return AiIndexingJob.restore({
      id: this.id,
      tenantId: this.tenantId,
      sourceId: this.sourceId,
      kind: this.kind,
      documentId: this.documentId,
      idempotencyKey: this.idempotencyKey,
      status: 'FAILED',
      attempts: this.attempts + 1,
      maxAttempts: this.maxAttempts,
      lastError: String(error ?? '').slice(0, 500),
      nextAttemptAt: new Date(now.getTime() + delayMs),
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }
}
