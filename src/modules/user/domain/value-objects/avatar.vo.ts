export class Avatar {
  private constructor(private readonly value: string) {}

  public static create(value: string | null): Avatar | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    if (normalized.length > 500) {
      throw new Error('Avatar URL cannot exceed 500 characters.');
    }

    return new Avatar(normalized);
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: Avatar | null): boolean {
    if (!other) {
      return false;
    }

    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
