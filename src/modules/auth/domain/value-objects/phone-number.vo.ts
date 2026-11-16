/**
 * Número de telefone usado como identificador de login.
 *
 * A normalização remove espaços, hífenes e parênteses,
 * preservando apenas o prefixo internacional opcional (+).
 */
export class PhoneNumber {
  private constructor(private readonly value: string) {}

  public static create(value: string): PhoneNumber {
    const trimmed = value?.trim();

    if (!trimmed) {
      throw new Error('Phone number is required.');
    }

    const hasInternationalPrefix = trimmed.startsWith('+');

    const digits = trimmed.replace(/\D/g, '');

    const normalized = (hasInternationalPrefix ? '+' : '') + digits;

    if (!/^\+?[1-9]\d{7,14}$/.test(normalized)) {
      throw new Error('Invalid phone number.');
    }

    return new PhoneNumber(normalized);
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: PhoneNumber): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
