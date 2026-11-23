/**
 * Nome canónico de uma ferramenta do catálogo (secção 11).
 *
 * Formato `<módulo>.<acção>` em camelCase, por exemplo
 * `employees.search`, `leave.getBalance`, `payroll.getRun`.
 *
 * RN-AI-016: ferramentas não registadas nunca são executadas — o
 * nome é a chave de procura no registo e é validado antes de qualquer
 * consulta de permissões.
 */
const TOOL_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;

export class AiToolName {
  private constructor(readonly value: string) {}

  static create(value: string): AiToolName {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized.length > 80 || !TOOL_NAME_PATTERN.test(normalized))
      throw new Error(`Nome de ferramenta inválido: ${value}.`);
    return new AiToolName(normalized);
  }

  static isValid(value: unknown): boolean {
    return typeof value === 'string' && TOOL_NAME_PATTERN.test(value.trim());
  }

  get module(): string {
    return this.value.slice(0, this.value.indexOf('.'));
  }

  get action(): string {
    return this.value.slice(this.value.indexOf('.') + 1);
  }

  equals(other: AiToolName): boolean {
    return other instanceof AiToolName && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
