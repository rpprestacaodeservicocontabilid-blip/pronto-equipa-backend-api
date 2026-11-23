import { AiTokenUsage } from './ai-token-usage.vo';

const CURRENCIES = ['AOA', 'USD', 'EUR'] as const;
export type AiCostCurrency = (typeof CURRENCIES)[number];

/**
 * Custo estimado ou confirmado de uma utilização de IA (RF-AI-063).
 *
 * RN-AI-011: distingue valores confirmados de estimativas — o campo
 * `estimated` reflecte se o valor veio da tabela de preços do
 * fornecedor ou de uma projecção.
 */
export class AiCost {
  private constructor(
    readonly amount: number,
    readonly currency: AiCostCurrency,
    readonly estimated: boolean,
  ) {}

  static create(amount: number, currency: string = 'AOA', estimated = true): AiCost {
    if (!Number.isFinite(amount) || amount < 0)
      throw new Error('Custo inválido: deve ser um número não negativo.');
    const normalized = String(currency ?? '').trim().toUpperCase() as AiCostCurrency;
    if (!CURRENCIES.includes(normalized)) throw new Error(`Moeda não suportada: ${currency}.`);
    return new AiCost(Math.round(amount * 10000) / 10000, normalized, estimated);
  }

  static zero(currency: AiCostCurrency = 'AOA'): AiCost {
    return new AiCost(0, currency, false);
  }

  /**
   * Estima o custo a partir do consumo e de preços por milhão de tokens.
   * Preços expressos na mesma moeda do resultado.
   */
  static estimate(
    usage: AiTokenUsage,
    pricing: { inputPerMillion: number; outputPerMillion: number; currency?: AiCostCurrency },
    estimated = true,
  ): AiCost {
    const amount =
      (usage.inputTokens * pricing.inputPerMillion) / 1_000_000 +
      (usage.outputTokens * pricing.outputPerMillion) / 1_000_000;
    return AiCost.create(amount, pricing.currency ?? 'AOA', estimated);
  }

  add(other: AiCost): AiCost {
    if (other.currency !== this.currency)
      throw new Error('Não é possível somar custos de moedas diferentes.');
    return new AiCost(
      Math.round((this.amount + other.amount) * 10000) / 10000,
      this.currency,
      this.estimated || other.estimated,
    );
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  toJSON() {
    return { amount: this.amount, currency: this.currency, estimated: this.estimated };
  }
}
