export class SessionId {
  private constructor(
    private readonly value: string,
  ) {}

  public static create(
    value: string,
  ): SessionId {
    const normalized = value?.trim();

    if (!normalized) {
      throw new Error(
        "Session ID is required.",
      );
    }

    return new SessionId(normalized);
  }

  public getValue(): string {
    return this.value;
  }

  public equals(
    other: SessionId,
  ): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}