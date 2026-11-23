const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * Versão semântica de uma ferramenta (RF-AI-042).
 *
 * RN-AI-017: a execução valida a versão apresentada contra a versão
 * registada — uma proposta aprovada não pode ser reexecutada com uma
 * versão diferente daquela que foi aprovada.
 */
export class AiToolVersion {
  private constructor(
    readonly major: number,
    readonly minor: number,
    readonly patch: number,
  ) {}

  static create(value: string): AiToolVersion {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!VERSION_PATTERN.test(normalized))
      throw new Error(`Versão de ferramenta inválida: ${value}.`);
    const [major, minor, patch] = normalized.split('.').map(Number);
    return new AiToolVersion(major, minor, patch);
  }

  static current(): AiToolVersion {
    return new AiToolVersion(1, 0, 0);
  }

  static isValid(value: unknown): boolean {
    return typeof value === 'string' && VERSION_PATTERN.test(value.trim());
  }

  isCompatibleWith(other: AiToolVersion): boolean {
    return this.major === other.major;
  }

  greaterThan(other: AiToolVersion): boolean {
    if (this.major !== other.major) return this.major > other.major;
    if (this.minor !== other.minor) return this.minor > other.minor;
    return this.patch > other.patch;
  }

  equals(other: AiToolVersion): boolean {
    return (
      other instanceof AiToolVersion &&
      this.major === other.major &&
      this.minor === other.minor &&
      this.patch === other.patch
    );
  }

  toString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }
}
