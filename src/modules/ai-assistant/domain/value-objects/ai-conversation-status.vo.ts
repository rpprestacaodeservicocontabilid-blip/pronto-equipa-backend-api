export const AI_CONVERSATION_STATUSES = ['ACTIVE', 'ARCHIVED', 'DELETED'] as const;
export type AiConversationStatusValue = (typeof AI_CONVERSATION_STATUSES)[number];

const TRANSITIONS: Readonly<Record<AiConversationStatusValue, readonly AiConversationStatusValue[]>> =
  {
    ACTIVE: ['ARCHIVED', 'DELETED'],
    ARCHIVED: ['ACTIVE', 'DELETED'],
    DELETED: [],
  };

/**
 * Ciclo de vida de uma conversa (RF-AI-006, RF-AI-007).
 *
 * `DELETED` é um estado terminal lógico: a eliminação obedece à
 * política de retenção e nunca remove dados já auditados.
 */
export class AiConversationStatus {
  private constructor(readonly value: AiConversationStatusValue) {}

  static from(value: string): AiConversationStatus {
    const normalized = String(value ?? '').trim().toUpperCase() as AiConversationStatusValue;
    if (!AI_CONVERSATION_STATUSES.includes(normalized))
      throw new Error(`Estado de conversa inválido: ${value}.`);
    return new AiConversationStatus(normalized);
  }

  canTransitionTo(next: AiConversationStatus): boolean {
    return TRANSITIONS[this.value].includes(next.value);
  }

  get isTerminal(): boolean {
    return this.value === 'DELETED';
  }

  get isUsable(): boolean {
    return this.value === 'ACTIVE';
  }

  equals(other: AiConversationStatus): boolean {
    return this.value === other.value;
  }
}
