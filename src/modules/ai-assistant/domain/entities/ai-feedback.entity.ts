import { randomUUID } from 'crypto';
import { AiValidationError } from '../errors/ai-domain.error';

export const AI_FEEDBACK_RATINGS = [1, 2, 3, 4, 5] as const;
export type AiFeedbackRating = (typeof AI_FEEDBACK_RATINGS)[number];

export interface CreateAiFeedbackInput {
  tenantId: number;
  interactionId: string;
  userId: number;
  rating: number;
  comment?: string | null;
  category?: string | null;
  id?: string;
  now?: Date;
}

/**
 * Avaliação de qualidade de uma resposta (RF-AI-010, RF-AI-075).
 */
export class AiFeedback {
  readonly id: string;
  readonly tenantId: number;
  readonly interactionId: string;
  readonly userId: number;
  readonly rating: AiFeedbackRating;
  readonly comment: string | null;
  readonly category: string | null;
  readonly createdAt: Date;

  private constructor(input: {
    id?: string;
    tenantId: number;
    interactionId: string;
    userId: number;
    rating: AiFeedbackRating;
    comment: string | null;
    category: string | null;
    now?: Date;
  }) {
    this.id = input.id ?? randomUUID();
    this.tenantId = input.tenantId;
    this.interactionId = input.interactionId;
    this.userId = input.userId;
    this.rating = input.rating;
    this.comment = input.comment;
    this.category = input.category;
    this.createdAt = input.now ?? new Date();
  }

  static create(input: CreateAiFeedbackInput): AiFeedback {
    if (!Number.isSafeInteger(input.tenantId) || input.tenantId <= 0)
      throw new AiValidationError('Contexto de empresa inválido.');
    if (!input.interactionId) throw new AiValidationError('Interação obrigatória.');
    if (!(AI_FEEDBACK_RATINGS as readonly number[]).includes(input.rating))
      throw new AiValidationError('Avaliação deve estar entre 1 e 5.');

    const comment = String(input.comment ?? '').trim().slice(0, 2000) || null;
    const category = String(input.category ?? '').trim().slice(0, 60) || null;

    return new AiFeedback({ ...input, rating: input.rating as AiFeedbackRating, comment, category });
  }

  static restore(
    props: CreateAiFeedbackInput & { rating: AiFeedbackRating; createdAt?: Date },
  ): AiFeedback {
    const feedback = new AiFeedback({
      id: props.id,
      tenantId: props.tenantId,
      interactionId: props.interactionId,
      userId: props.userId,
      rating: props.rating,
      comment: props.comment ?? null,
      category: props.category ?? null,
      now: props.createdAt ?? props.now ?? new Date(),
    });
    return feedback;
  }
}
