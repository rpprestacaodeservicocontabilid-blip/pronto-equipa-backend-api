/**
 * Consumo de tokens de uma invocação (RF-AI-061).
 *
 * Os valores são sempre medidos no fornecedor e reportados de volta —
 * nunca estimados pelo módulo quando o fornecedor expõe o consumo real.
 */
export class AiTokenUsage {
  private constructor(
    readonly inputTokens: number,
    readonly outputTokens: number,
    readonly cachedTokens: number,
  ) {}

  static create(input: number, output: number, cached = 0): AiTokenUsage {
    for (const [label, value] of [
      ['entrada', input],
      ['saída', output],
      ['cache', cached],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`Contagem de tokens de ${label} inválida.`);
    }
    return new AiTokenUsage(input, output, cached);
  }

  static zero(): AiTokenUsage {
    return new AiTokenUsage(0, 0, 0);
  }

  get totalTokens(): number {
    return this.inputTokens + this.outputTokens;
  }

  add(other: AiTokenUsage): AiTokenUsage {
    return new AiTokenUsage(
      this.inputTokens + other.inputTokens,
      this.outputTokens + other.outputTokens,
      this.cachedTokens + other.cachedTokens,
    );
  }

  isEmpty(): boolean {
    return this.totalTokens === 0 && this.cachedTokens === 0;
  }

  toJSON() {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      cachedTokens: this.cachedTokens,
      totalTokens: this.totalTokens,
    };
  }
}
