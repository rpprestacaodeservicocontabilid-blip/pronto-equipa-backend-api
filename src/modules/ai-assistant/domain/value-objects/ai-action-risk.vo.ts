export const AI_ACTION_RISKS = ['READ_ONLY', 'LOW', 'HIGH', 'CRITICAL'] as const;
export type AiActionRiskValue = (typeof AI_ACTION_RISKS)[number];

const RANK: Readonly<Record<AiActionRiskValue, number>> = {
  READ_ONLY: 0,
  LOW: 1,
  HIGH: 2,
  CRITICAL: 3,
};

/**
 * Classificação de risco de uma ferramenta ou proposta de acção.
 *
 * RN-AI-018: acções sensíveis exigem confirmação ou aprovação
 * humana. O risco determina a política aplicável e nunca é inferido
 * pelo modelo — vem da definição registada da ferramenta.
 */
export class AiActionRisk {
  private constructor(readonly value: AiActionRiskValue) {}

  static from(value: string): AiActionRisk {
    const normalized = String(value ?? '').trim().toUpperCase() as AiActionRiskValue;
    if (!AI_ACTION_RISKS.includes(normalized)) throw new Error(`Risco de acção inválido: ${value}.`);
    return new AiActionRisk(normalized);
  }

  static highest(a: AiActionRisk, b: AiActionRisk): AiActionRisk {
    return RANK[a.value] >= RANK[b.value] ? a : b;
  }

  get rank(): number {
    return RANK[this.value];
  }

  /** Ferramentas de escrita: exigem política explícita (invariante). */
  get isWrite(): boolean {
    return this.value !== 'READ_ONLY';
  }

  get requiresApproval(): boolean {
    return this.value === 'HIGH' || this.value === 'CRITICAL';
  }

  get requiresConfirmation(): boolean {
    return this.value !== 'READ_ONLY';
  }

  atLeast(other: AiActionRisk): boolean {
    return this.rank >= other.rank;
  }

  equals(other: AiActionRisk): boolean {
    return this.value === other.value;
  }
}
