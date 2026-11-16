export class AuthAccountId {
  private constructor(private readonly value: number) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error('Auth account ID must be a non-negative integer.');
    }
  }

  public static create(value: number): AuthAccountId {
    return new AuthAccountId(value);
  }

  /**
   * ID temporário utilizado antes
   * da persistência no banco de dados.
   */
  public static temporary(): AuthAccountId {
    return new AuthAccountId(0);
  }

  public isPersisted(): boolean {
    return this.value > 0;
  }

  public isTemporary(): boolean {
    return this.value === 0;
  }

  public getValue(): number {
    return this.value;
  }

  public equals(other: AuthAccountId): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value.toString();
  }
}
