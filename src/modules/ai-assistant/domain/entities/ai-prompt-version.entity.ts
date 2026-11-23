import { randomUUID } from 'crypto';
import { AiValidationError } from '../errors/ai-domain.error';

export const AI_PROMPT_STATUSES = ['DRAFT', 'TESTED', 'PUBLISHED', 'ARCHIVED'] as const;
export type AiPromptStatus = (typeof AI_PROMPT_STATUSES)[number];

export interface CreateAiPromptVersionInput {
  templateCode: string;
  version: number;
  content: string;
  modelHints?: string[];
  status?: string;
  createdBy?: number | null;
  id?: string;
  now?: Date;
}

/**
 * Versão de um prompt (RF-AI-054/055/056, RNF-AI-014).
 *
 * Invariantes:
 *  - o conteúdo é imutável depois de publicado;
 *  - cada interacção regista a versão efectivamente utilizada;
 *  - apenas uma versão publicada por template.
 */
export class AiPromptVersion {
  readonly id: string;
  readonly templateCode: string;
  readonly version: number;
  readonly content: string;
  readonly modelHints: readonly string[];
  readonly status: AiPromptStatus;
  readonly createdBy: number | null;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;

  private constructor(
    input: CreateAiPromptVersionInput & {
      status: AiPromptStatus;
      publishedAt: Date | null;
      createdAt: Date;
    },
  ) {
    this.id = input.id ?? randomUUID();
    this.templateCode = input.templateCode;
    this.version = input.version;
    this.content = input.content;
    this.modelHints = Object.freeze([...(input.modelHints ?? [])]);
    this.status = input.status;
    this.createdBy = input.createdBy ?? null;
    this.publishedAt = input.publishedAt;
    this.createdAt = input.createdAt;
  }

  static create(input: CreateAiPromptVersionInput): AiPromptVersion {
    const templateCode = String(input.templateCode ?? '').trim();
    if (!/^[A-Z][A-Z0-9_-]{1,60}$/.test(templateCode))
      throw new AiValidationError(`Código de prompt inválido: ${input.templateCode}.`);
    if (!Number.isSafeInteger(input.version) || input.version <= 0)
      throw new AiValidationError('A versão do prompt deve ser um inteiro positivo.');

    const content = String(input.content ?? '').trim();
    if (content.length < 10 || content.length > 32000)
      throw new AiValidationError('O conteúdo do prompt deve ter entre 10 e 32000 caracteres.');

    const status = String(input.status ?? 'DRAFT').toUpperCase() as AiPromptStatus;
    if (!AI_PROMPT_STATUSES.includes(status))
      throw new AiValidationError(`Estado de prompt inválido: ${input.status}.`);
    if (status === 'PUBLISHED')
      throw new AiValidationError('Use o fluxo de publicação para promover uma versão.');

    return new AiPromptVersion({
      ...input,
      templateCode,
      content,
      status,
      publishedAt: null,
      createdAt: input.now ?? new Date(),
    });
  }

  static restore(
    props: CreateAiPromptVersionInput & {
      status: AiPromptStatus;
      publishedAt?: Date | null;
      createdAt?: Date;
    },
  ): AiPromptVersion {
    return new AiPromptVersion({
      ...props,
      publishedAt: props.publishedAt ?? null,
      createdAt: props.createdAt ?? new Date(),
    });
  }

  get isPublished(): boolean {
    return this.status === 'PUBLISHED';
  }

  /** Publicação da versão (RF-AI-056). */
  publish(now = new Date()): AiPromptVersion {
    if (this.status === 'PUBLISHED') return this;
    if (this.status === 'ARCHIVED')
      throw new AiValidationError('Não é possível publicar uma versão arquivada.');
    return new AiPromptVersion({
      id: this.id,
      templateCode: this.templateCode,
      version: this.version,
      content: this.content,
      modelHints: [...this.modelHints],
      status: 'PUBLISHED',
      createdBy: this.createdBy,
      publishedAt: now,
      createdAt: this.createdAt,
    });
  }
}
