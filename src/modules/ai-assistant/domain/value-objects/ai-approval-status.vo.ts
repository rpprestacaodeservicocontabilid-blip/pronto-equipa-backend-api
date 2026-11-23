export const AI_APPROVAL_STATUSES = [
  'PROPOSED',
  'CONFIRMED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'EXECUTED',
] as const;
export type AiApprovalStatusValue = (typeof AI_APPROVAL_STATUSES)[number];

const TRANSITIONS: Readonly<Record<AiApprovalStatusValue, readonly AiApprovalStatusValue[]>> = {
  PROPOSED: ['CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  APPROVED: ['EXECUTED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
  EXECUTED: [],
};

/**
 * Estado de uma proposta de acção (RF-AI-047, RF-AI-048).
 *
 * CA-AI-016: uma proposta aprovada mantém os argumentos imutáveis —
 * qualquer alteração obriga a uma nova proposta.
 */
export class AiApprovalStatus {
  private constructor(readonly value: AiApprovalStatusValue) {}

  static from(value: string): AiApprovalStatus {
    const normalized = String(value ?? '').trim().toUpperCase() as AiApprovalStatusValue;
    if (!AI_APPROVAL_STATUSES.includes(normalized))
      throw new Error(`Estado de aprovação inválido: ${value}.`);
    return new AiApprovalStatus(normalized);
  }

  canTransitionTo(next: AiApprovalStatus): boolean {
    return TRANSITIONS[this.value].includes(next.value);
  }

  get isTerminal(): boolean {
    return !TRANSITIONS[this.value].length;
  }

  get isDecided(): boolean {
    return this.value === 'REJECTED' || this.value === 'CANCELLED' || this.value === 'EXPIRED';
  }

  get isExecutable(): boolean {
    return this.value === 'APPROVED' || this.value === 'CONFIRMED';
  }

  equals(other: AiApprovalStatus): boolean {
    return this.value === other.value;
  }
}
