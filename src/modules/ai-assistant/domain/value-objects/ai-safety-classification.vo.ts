export const AI_SAFETY_CLASSIFICATIONS = ['SAFE', 'SUSPICIOUS', 'BLOCKED'] as const;
export type AiSafetyClassificationValue = (typeof AI_SAFETY_CLASSIFICATIONS)[number];

const SEVERITY: Readonly<Record<AiSafetyClassificationValue, number>> = {
  SAFE: 0,
  SUSPICIOUS: 1,
  BLOCKED: 2,
};

/**
 * Classificação de segurança de um conteúdo analisado
 * (RF-AI-071, RF-AI-072).
 *
 * RN-AI-021: instruções presentes em conteúdo recuperado nunca se
 * sobrepõem às políticas do sistema — um conteúdo classificado como
 * `BLOCKED` é excluído do contexto e nunca chega ao modelo.
 */
export class AiSafetyClassification {
  private constructor(
    readonly value: AiSafetyClassificationValue,
    readonly reasons: readonly string[],
  ) {}

  static from(value: string, reasons: readonly string[] = []): AiSafetyClassification {
    const normalized = String(value ?? '').trim().toUpperCase() as AiSafetyClassificationValue;
    if (!AI_SAFETY_CLASSIFICATIONS.includes(normalized))
      throw new Error(`Classificação de segurança inválida: ${value}.`);
    return new AiSafetyClassification(normalized, [...reasons]);
  }

  static safe(): AiSafetyClassification {
    return new AiSafetyClassification('SAFE', []);
  }

  static blocked(reason: string): AiSafetyClassification {
    return new AiSafetyClassification('BLOCKED', [reason]);
  }

  static suspicious(reason: string): AiSafetyClassification {
    return new AiSafetyClassification('SUSPICIOUS', [reason]);
  }

  get isBlocked(): boolean {
    return this.value === 'BLOCKED';
  }

  get isSafe(): boolean {
    return this.value === 'SAFE';
  }

  severity(): number {
    return SEVERITY[this.value];
  }

  atLeast(other: AiSafetyClassification): boolean {
    return this.severity() >= other.severity();
  }

  merge(other: AiSafetyClassification): AiSafetyClassification {
    const winner = other.severity() >= this.severity() ? other : this;
    return new AiSafetyClassification(winner.value, [...new Set([...this.reasons, ...winner.reasons])]);
  }

  toJSON() {
    return { classification: this.value, reasons: [...this.reasons] };
  }
}
