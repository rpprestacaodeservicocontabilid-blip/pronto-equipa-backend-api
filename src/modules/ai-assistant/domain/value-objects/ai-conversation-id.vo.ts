import { randomUUID } from 'crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Identificador de uma conversa empresarial.
 *
 * RN-AI-001: toda a conversa empresarial pertence a um tenant — o
 * identificador por si só nunca autoriza o acesso; a titularidade é
 * validada pelo repositório dentro do contexto de tenant.
 */
export class AiConversationId {
  private constructor(readonly value: string) {}

  static create(value?: string): AiConversationId {
    return value === undefined ? new AiConversationId(randomUUID()) : AiConversationId.parse(value);
  }

  static parse(value: string): AiConversationId {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!UUID_PATTERN.test(normalized)) throw new Error('Identificador de conversa inválido.');
    return new AiConversationId(normalized);
  }

  static isValid(value: unknown): boolean {
    return typeof value === 'string' && UUID_PATTERN.test(value.trim().toLowerCase());
  }

  equals(other: AiConversationId): boolean {
    return other instanceof AiConversationId && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
