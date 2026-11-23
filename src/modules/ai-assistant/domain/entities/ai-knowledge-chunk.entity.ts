import { randomUUID } from 'crypto';
import { AiValidationError } from '../errors/ai-domain.error';

export type AiKnowledgeScope = 'PLATFORM' | 'TENANT';

export interface CreateAiKnowledgeChunkInput {
  tenantId: number | null;
  scope: string;
  documentId: string;
  documentVersionId: string;
  classification: string;
  sourceModule: string;
  content: string;
  sequence: number;
  accessPolicyVersion: string;
  sourceId: string;
  id?: string;
  now?: Date;
}

/**
 * Segmento indexado de um documento (secção 13.4, RF-AI-024/026/029).
 *
 * Cada segmento preserva o metadado de isolamento: âmbito,
 * classificação, módulo de origem e versão da política de acesso.
 * O filtro de autorização é aplicado antes de entregar o segmento ao
 * modelo e novamente antes de apresentar citações.
 */
export class AiKnowledgeChunk {
  readonly id: string;
  readonly tenantId: number | null;
  readonly scope: AiKnowledgeScope;
  readonly documentId: string;
  readonly documentVersionId: string;
  readonly classification: string;
  readonly sourceModule: string;
  readonly content: string;
  readonly sequence: number;
  readonly accessPolicyVersion: string;
  readonly sourceId: string;
  readonly indexedAt: Date;
  readonly status: 'ACTIVE' | 'REVOKED';

  private constructor(
    input: CreateAiKnowledgeChunkInput & {
      scope: AiKnowledgeScope;
      status: 'ACTIVE' | 'REVOKED';
      indexedAt: Date;
    },
  ) {
    this.id = input.id ?? randomUUID();
    this.tenantId = input.tenantId;
    this.scope = input.scope;
    this.documentId = input.documentId;
    this.documentVersionId = input.documentVersionId;
    this.classification = input.classification;
    this.sourceModule = input.sourceModule;
    this.content = input.content;
    this.sequence = input.sequence;
    this.accessPolicyVersion = input.accessPolicyVersion;
    this.sourceId = input.sourceId;
    this.indexedAt = input.indexedAt;
    this.status = input.status;
  }

  static create(input: CreateAiKnowledgeChunkInput): AiKnowledgeChunk {
    const scope = String(input.scope ?? '').trim().toUpperCase();
    if (scope !== 'PLATFORM' && scope !== 'TENANT')
      throw new AiValidationError(`Âmbito de conhecimento inválido: ${input.scope}.`);
    if (scope === 'TENANT' && (!input.tenantId || input.tenantId <= 0))
      throw new AiValidationError('Segmento de empresa sem tenant associado.');
    if (scope === 'PLATFORM' && input.tenantId !== null)
      throw new AiValidationError('Segmento de plataforma não pode pertencer a uma empresa.');
    if (!input.documentId || !input.sourceId)
      throw new AiValidationError('Segmento sem documento ou fonte associada.');
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 0)
      throw new AiValidationError('Sequência do segmento inválida.');

    const content = String(input.content ?? '').trim();
    if (!content) throw new AiValidationError('Segmento de conhecimento vazio.');

    return new AiKnowledgeChunk({
      ...input,
      scope,
      content: content.slice(0, 8000),
      status: 'ACTIVE',
      indexedAt: input.now ?? new Date(),
    });
  }

  static restore(
    props: CreateAiKnowledgeChunkInput & {
      scope: AiKnowledgeScope;
      status: 'ACTIVE' | 'REVOKED';
      indexedAt?: Date;
    },
  ): AiKnowledgeChunk {
    return new AiKnowledgeChunk({ ...props, indexedAt: props.indexedAt ?? new Date() });
  }

  get isRevoked(): boolean {
    return this.status === 'REVOKED';
  }

  /** Segmento apresentável a um tenant dado o âmbito e a política. */
  isAccessibleBy(tenantId: number, allowedClassifications: readonly string[]): boolean {
    if (this.isRevoked) return false;
    if (this.scope === 'TENANT' && this.tenantId !== tenantId) return false;
    return allowedClassifications.includes(this.classification);
  }
}
