export const AI_INTERACTION_STATUSES = [
  'RECEIVED',
  'VALIDATING',
  'AUTHORIZING',
  'BUILDING_CONTEXT',
  'RETRIEVING',
  'GENERATING',
  'TOOL_PENDING',
  'AWAITING_CONFIRMATION',
  'AWAITING_APPROVAL',
  'EXECUTING_TOOL',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'BLOCKED',
] as const;
export type AiInteractionStatusValue = (typeof AI_INTERACTION_STATUSES)[number];

const TRANSITIONS: Readonly<Record<AiInteractionStatusValue, readonly AiInteractionStatusValue[]>> =
  {
    RECEIVED: ['VALIDATING', 'FAILED', 'CANCELLED', 'BLOCKED'],
    VALIDATING: ['AUTHORIZING', 'FAILED', 'CANCELLED', 'BLOCKED'],
    AUTHORIZING: ['BUILDING_CONTEXT', 'FAILED', 'CANCELLED', 'BLOCKED'],
    BUILDING_CONTEXT: ['RETRIEVING', 'GENERATING', 'FAILED', 'CANCELLED', 'BLOCKED'],
    RETRIEVING: ['GENERATING', 'FAILED', 'CANCELLED', 'BLOCKED'],
    GENERATING: ['TOOL_PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'],
    TOOL_PENDING: [
      'AWAITING_CONFIRMATION',
      'AWAITING_APPROVAL',
      'EXECUTING_TOOL',
      'FAILED',
      'CANCELLED',
      'BLOCKED',
    ],
    AWAITING_CONFIRMATION: ['EXECUTING_TOOL', 'CANCELLED', 'FAILED', 'BLOCKED'],
    AWAITING_APPROVAL: ['EXECUTING_TOOL', 'CANCELLED', 'FAILED', 'BLOCKED'],
    EXECUTING_TOOL: ['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'],
    COMPLETED: [],
    FAILED: [],
    CANCELLED: [],
    BLOCKED: [],
  };

const TERMINAL: readonly AiInteractionStatusValue[] = [
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'BLOCKED',
];

/**
 * Ciclo de vida de uma interacção (secção 10.1 da especificação).
 *
 * RN-AI-005: o histórico nunca substitui a validação de autorização —
 * cada transição é validada e auditada no momento em que ocorre.
 */
export class AiInteractionStatus {
  private constructor(readonly value: AiInteractionStatusValue) {}

  static from(value: string): AiInteractionStatus {
    const normalized = String(value ?? '').trim().toUpperCase() as AiInteractionStatusValue;
    if (!AI_INTERACTION_STATUSES.includes(normalized))
      throw new Error(`Estado de interacção inválido: ${value}.`);
    return new AiInteractionStatus(normalized);
  }

  canTransitionTo(next: AiInteractionStatus): boolean {
    return TRANSITIONS[this.value].includes(next.value);
  }

  get isTerminal(): boolean {
    return TERMINAL.includes(this.value);
  }

  get isAwaitingHuman(): boolean {
    return this.value === 'AWAITING_CONFIRMATION' || this.value === 'AWAITING_APPROVAL';
  }

  equals(other: AiInteractionStatus): boolean {
    return this.value === other.value;
  }
}
