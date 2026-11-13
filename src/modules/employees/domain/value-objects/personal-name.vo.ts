export class PersonalName {
  private constructor(readonly value: string) {}

  static create(value: string, field: string): PersonalName {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized || normalized.length > 100) {
      throw new Error(`${field} must contain 1 to 100 characters.`);
    }

    return new PersonalName(normalized);
  }
}
