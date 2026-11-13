export class EmployeeNumber {
  private constructor(readonly value: string) {}

  static create(value: string): EmployeeNumber {
    const normalized = value.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,49}$/.test(normalized)) {
      throw new Error('Employee number must be 1 to 50 valid characters.');
    }

    return new EmployeeNumber(normalized);
  }
}
