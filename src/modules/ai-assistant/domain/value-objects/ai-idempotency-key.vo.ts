/**
 * Chave de idempotência de um pedido de IA (RNF-AI-004, RN-AI-029).
 *
 * Garante que repetições do mesmo pedido não duplicam mensagens,
 * interacções nem consumo (CA-AI-018).
 */
export class AiIdempotencyKey {
  private constructor(readonly value: string) {}

  static create(value: string): AiIdempotencyKey {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized.length < 8 || normalized.length > 160)
      throw new Error('A chave de idempotência deve ter entre 8 e 160 caracteres.');
    if (!/^[A-Za-z0-9._:-]+$/.test(normalized))
      throw new Error('A chave de idempotência contém caracteres não permitidos.');
    return new AiIdempotencyKey(normalized);
  }

  static isValid(value: unknown): boolean {
    return (
      typeof value === 'string' &&
      value.trim().length >= 8 &&
      value.trim().length <= 160 &&
      /^[A-Za-z0-9._:-]+$/.test(value.trim())
    );
  }

  equals(other: AiIdempotencyKey): boolean {
    return other instanceof AiIdempotencyKey && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
