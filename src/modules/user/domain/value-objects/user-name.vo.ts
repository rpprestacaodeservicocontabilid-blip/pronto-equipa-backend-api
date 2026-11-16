export class UserName {
  private constructor(private readonly value: string) {}

  public static create(value: string): UserName {
    const normalized = value?.trim();

    if (!normalized) {
      throw new Error('User name is required.');
    }

    if (normalized.length < 2) {
      throw new Error('User name must contain at least 2 characters.');
    }

    if (normalized.length > 150) {
      throw new Error('User name cannot exceed 150 characters.');
    }

    return new UserName(normalized);
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: UserName): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
