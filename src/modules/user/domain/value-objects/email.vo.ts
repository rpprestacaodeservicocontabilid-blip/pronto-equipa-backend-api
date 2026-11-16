export class Email {
  private constructor(private readonly value: string) {}

  public static create(value: string): Email {
    const normalized = value?.trim().toLowerCase();

    if (!normalized) {
      throw new Error('Email is required.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalized)) {
      throw new Error('Invalid email address.');
    }

    return new Email(normalized);
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: Email): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
