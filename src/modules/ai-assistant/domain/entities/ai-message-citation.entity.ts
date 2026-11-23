import { randomUUID } from 'crypto';
import { AiValidationError } from '../errors/ai-domain.error';

export interface CreateAiMessageCitationInput {
  tenantId: number;
  messageId: string;
  sourceId: string;
  title: string;
  reference: string;
  chunkId?: string | null;
  score?: number;
  id?: string;
  now?: Date;
}

/**
 * Citação apresentada junto de uma resposta (RF-AI-027).
 *
 * Invariante: os resultados recuperados preservam referências de
 * origem — uma resposta sem evidência declara a limitação em vez de
 * inventar fontes (RN-AI-014, RN-AI-015).
 */
export class AiMessageCitation {
  readonly id: string;
  readonly tenantId: number;
  readonly messageId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly reference: string;
  readonly chunkId: string | null;
  readonly score: number;
  readonly createdAt: Date;

  private constructor(input: CreateAiMessageCitationInput & { score: number }) {
    this.id = input.id ?? randomUUID();
    this.tenantId = input.tenantId;
    this.messageId = input.messageId;
    this.sourceId = input.sourceId;
    this.title = input.title;
    this.reference = input.reference;
    this.chunkId = input.chunkId ?? null;
    this.score = input.score;
    this.createdAt = input.now ?? new Date();
  }

  static create(input: CreateAiMessageCitationInput): AiMessageCitation {
    if (!Number.isSafeInteger(input.tenantId) || input.tenantId <= 0)
      throw new AiValidationError('Contexto de empresa inválido.');
    if (!input.messageId || !input.sourceId)
      throw new AiValidationError('Citação sem mensagem ou fonte associada.');

    const title = String(input.title ?? '').trim().slice(0, 300);
    const reference = String(input.reference ?? '').trim().slice(0, 500);
    if (!reference) throw new AiValidationError('A citação deve indicar a referência de origem.');

    const score = Number(input.score ?? 0);
    if (!Number.isFinite(score) || score < 0 || score > 1)
      throw new AiValidationError('Relevância da citação inválida.');

    return new AiMessageCitation({ ...input, title, reference, score });
  }

  static restore(
    props: CreateAiMessageCitationInput & { score?: number; createdAt?: Date },
  ): AiMessageCitation {
    return new AiMessageCitation({ ...props, score: props.score ?? 0, now: props.createdAt });
  }
}
