import { ValidationError } from '../../../../shared/errors/app.error';

const isDateOnly = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

export class DateRange {
  private constructor(
    readonly from: string,
    readonly to: string | null,
  ) {}

  static create(from: string, to: string | null): DateRange {
    if (!isDateOnly(from) || (to !== null && !isDateOnly(to))) {
      throw new ValidationError('Dates must be valid calendar dates in YYYY-MM-DD format.');
    }
    if (to !== null && to < from)
      throw new ValidationError('End date must not precede start date.');
    return new DateRange(from, to);
  }
}
