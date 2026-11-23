import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { AiDomainEvent, AI_EVENTS } from '../events/ai-domain.event';
import { AiValidationError } from '../errors/ai-domain.error';

export interface AiKnowledgeSourceProps {
  id: string;
  scope: 'PLATFORM' | 'TENANT';
  tenantId: number | null;
  sourceType: string;
  referenceId: string | null;
  name: string;
  classification: string;
  sourceModule: string;
  status: 'ACTIVE' | 'REVOKED' | 'INDEXING' | 'FAILED';
  accessPolicyVersion: string;
  documentCount: number;
  chunkCount: number;
  lastIndexedAt: Date | null;
  revokedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterAiKnowledgeSourceInput {
  scope: string;
  tenantId?: number | null;
  sourceType: string;
  referenceId?: string | null;
  name: string;
  classification?: string;
  sourceModule: string;
  accessPolicyVersion?: string;
  id?: string;
  now?: Date;
}

/**
 * Fonte de conhecimento autorizada (secção 9.1, secção 13.2,
 * RF-AI-021/022/023/026/028).
 *
 * Invariantes:
 *  - uma fonte de empresa pertence a um único tenant;
 *  - uma fonte revogada não devolve resultados (CA-AI-010);
 *  - a revogação propaga-se aos segmentos indexados.
 */
export class AiKnowledgeSource extends AggregateRoot<AiKnowledgeSourceProps> {
  private constructor(props: AiKnowledgeSourceProps) {
    super(props);
  }

  static register(input: RegisterAiKnowledgeSourceInput): AiKnowledgeSource {
    const scope = String(input.scope ?? '').trim().toUpperCase();
    if (scope !== 'PLATFORM' && scope !== 'TENANT')
      throw new AiValidationError(`Âmbito de fonte inválido: ${input.scope}.`);
    if (scope === 'TENANT' && (!input.tenantId || input.tenantId <= 0))
      throw new AiValidationError('Fonte de empresa sem tenant associado.');
    if (scope === 'PLATFORM' && input.tenantId)
      throw new AiValidationError('Fonte de plataforma não pode pertencer a uma empresa.');

    const name = String(input.name ?? '').trim();
    if (name.length < 2 || name.length > 200)
      throw new AiValidationError('O nome da fonte deve ter entre 2 e 200 caracteres.');

    const now = input.now ?? new Date();
    const id = input.id ?? randomUUID();

    return new AiKnowledgeSource({
      id,
      scope,
      tenantId: scope === 'TENANT' ? (input.tenantId as number) : null,
      sourceType: String(input.sourceType ?? '').trim().toUpperCase() || 'DOCUMENT',
      referenceId: input.referenceId ?? null,
      name,
      classification: String(input.classification ?? 'INTERNAL').trim().toUpperCase(),
      sourceModule: String(input.sourceModule ?? 'ai-assistant').trim(),
      status: 'ACTIVE',
      accessPolicyVersion: input.accessPolicyVersion ?? 'v1',
      documentCount: 0,
      chunkCount: 0,
      lastIndexedAt: null,
      revokedAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: AiKnowledgeSourceProps): AiKnowledgeSource {
    return new AiKnowledgeSource({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): number | null {
    return this.props.tenantId;
  }

  get scope(): 'PLATFORM' | 'TENANT' {
    return this.props.scope;
  }

  get status(): AiKnowledgeSourceProps['status'] {
    return this.props.status;
  }

  get sourceType(): string {
    return this.props.sourceType;
  }

  get sourceModule(): string {
    return this.props.sourceModule;
  }

  get referenceId(): string | null {
    return this.props.referenceId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get name(): string {
    return this.props.name;
  }

  get classification(): string {
    return this.props.classification;
  }

  get accessPolicyVersion(): string {
    return this.props.accessPolicyVersion;
  }

  get chunkCount(): number {
    return this.props.chunkCount;
  }

  get documentCount(): number {
    return this.props.documentCount;
  }

  get lastIndexedAt(): Date | null {
    return this.props.lastIndexedAt;
  }

  get lastError(): string | null {
    return this.props.lastError;
  }

  get isRevoked(): boolean {
    return this.props.status === 'REVOKED';
  }

  /** Fonte pesquisável para um tenant (RN-AI-006, RF-AI-029). */
  isAccessibleBy(tenantId: number): boolean {
    if (this.isRevoked) return false;
    return this.props.scope === 'PLATFORM' || this.props.tenantId === tenantId;
  }

  markIndexing(now = new Date()): AiKnowledgeSourceProps {
    this.props.status = 'INDEXING';
    this.props.lastError = null;
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  markIndexed(counts: { documents?: number; chunks?: number }, now = new Date()): AiKnowledgeSourceProps {
    if (counts.documents !== undefined) this.props.documentCount = counts.documents;
    if (counts.chunks !== undefined) this.props.chunkCount = counts.chunks;
    this.props.status = 'ACTIVE';
    this.props.lastIndexedAt = now;
    this.props.lastError = null;
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  markFailed(error: string, now = new Date()): AiKnowledgeSourceProps {
    this.props.status = 'FAILED';
    this.props.lastError = String(error ?? '').slice(0, 500);
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  /** Revogação (RF-AI-026) — invalida a fonte e os seus segmentos. */
  revoke(reason: string, now = new Date()): AiKnowledgeSourceProps {
    if (this.isRevoked) return this.propsSnapshot;
    const normalized = String(reason ?? '').trim();
    if (!normalized) throw new AiValidationError('Indique o motivo da revogação.');
    this.props.status = 'REVOKED';
    this.props.revokedAt = now;
    this.props.lastError = normalized.slice(0, 500);
    this.props.chunkCount = 0;
    this.props.updatedAt = now;
    this.record(
      new AiDomainEvent({
        eventName: AI_EVENTS.KNOWLEDGE_REVOKED,
        aggregateId: this.props.id,
        companyId: this.props.tenantId,
        payload: { sourceId: this.props.id, reason: normalized.slice(0, 200) },
        occurredAt: now,
      }),
    );
    return this.propsSnapshot;
  }

  public get propsSnapshot(): AiKnowledgeSourceProps {
    return { ...this.props };
  }
}
