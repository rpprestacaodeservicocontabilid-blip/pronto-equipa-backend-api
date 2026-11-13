export class EmploymentDate {
  private constructor(readonly value: Date) {}

  static create(value: Date | string, field = 'Employment date'): EmploymentDate {
    const raw = value instanceof Date ? value.toISOString().slice(0, 10) : value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new Error(`${field} is invalid.`);
    }

    const [year, month, day] = raw.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new Error(`${field} is invalid.`);
    }

    return new EmploymentDate(date);
  }
}
