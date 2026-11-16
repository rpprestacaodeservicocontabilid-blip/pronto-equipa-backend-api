export class RefreshTokenValue {
  private constructor(private readonly value: string) {}

  public static create(value: string): RefreshTokenValue {
    if (!value?.trim()) {
      throw new Error('Refresh token is required.');
    }

    return new RefreshTokenValue(value);
  }

  public getValue(): string {
    return this.value;
  }

  public toString(): string {
    return this.value;
  }
}
