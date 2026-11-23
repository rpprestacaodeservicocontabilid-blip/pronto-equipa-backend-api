import { randomUUID } from 'crypto';
import { AiValidationError } from '../errors/ai-domain.error';

export const AI_MESSAGE_ROLES = ['USER', 'ASSISTANT', 'SYSTEM', 'TOOL'] as const;
export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

export interface CreateAiMessageInput {
  tenantId: number;
  conversationId: string;
  role: string;
  content: string;
  interactionId?: string | null;
  safetyClassification?: string;
  contentReference?: string;
  /** Chave idempotente da gravação (CA-AI-018). */
  idempotencyKey?: string | null;
  id?: string;
  now?: Date;
}

/**
 * Mensagem de uma conversa (RF-AI-002, RF-AI-003).
 *
 * RN-AI-007: o conteúdo é minimizado — o texto completo pode ficar
 * referenciado (`contentReference`) em vez de duplicado, conforme a
 * política de retenção.
 */
export class AiMessage {
  readonly id: string;
  readonly tenantId: number;
  readonly conversationId: string;
  readonly interactionId: string | null;
  readonly role: AiMessageRole;
  readonly content: string;
  readonly safetyClassification: string;
  readonly contentReference: string | null;
  readonly idempotencyKey: string | null;
  readonly createdAt: Date;

  private constructor(input: CreateAiMessageInput & { role: AiMessageRole; content: string }) {
    this.id = input.id ?? randomUUID();
    this.tenantId = input.tenantId;
    this.conversationId = input.conversationId;
    this.interactionId = input.interactionId ?? null;
    this.role = input.role;
    this.content = input.content;
    this.safetyClassification = input.safetyClassification ?? 'SAFE';
    this.contentReference = input.contentReference ?? null;
    this.idempotencyKey = input.idempotencyKey ?? null;
    this.createdAt = input.now ?? new Date();
  }

  static create(input: CreateAiMessageInput): AiMessage {
    if (!Number.isSafeInteger(input.tenantId) || input.tenantId <= 0)
      throw new AiValidationError('Contexto de empresa inválido.');
    if (!input.conversationId) throw new AiValidationError('Conversa obrigatória.');

    const role = String(input.role ?? '').trim().toUpperCase() as AiMessageRole;
    if (!AI_MESSAGE_ROLES.includes(role))
      throw new AiValidationError(`Papel de mensagem inválido: ${input.role}.`);

    const content = String(input.content ?? '');
    if (!content.trim()) throw new AiValidationError('A mensagem não pode estar vazia.');
    if (content.length > 64000) throw new AiValidationError('Mensagem demasiado longa.');

    return new AiMessage({ ...input, role, content });
  }

  static restore(
    props: CreateAiMessageInput & { role: AiMessageRole; content: string; createdAt?: Date },
  ): AiMessage {
    return new AiMessage({ ...props, now: props.createdAt });
  }

  get isUser(): boolean {
    return this.role === 'USER';
  }

  get isAssistant(): boolean {
    return this.role === 'ASSISTANT';
  }

  /** Texto efectivamente armazenado (directo ou por referência). */
  get storedContent(): string {
    return this.contentReference ? '' : this.content;
  }
}
