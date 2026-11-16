export class AccessToken {
  private constructor(private readonly value: string) {}

  public static create(value: string): AccessToken {
    if (!value?.trim()) {
      throw new Error('Access token is required.');
    }

    return new AccessToken(value);
  }

  public getValue(): string {
    return this.value;
  }

  public toString(): string {
    return this.value;
  }
}
