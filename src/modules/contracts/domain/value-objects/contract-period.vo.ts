import { ValidationError } from '../../../../shared/errors/app.error';

const isDateOnly = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

export class ContractPeriod {
  private constructor(
    readonly startDate: string,
    readonly endDate: string | null,
  ) {}

  static create(startDate: string, endDate: string | null): ContractPeriod {
    if (!isDateOnly(startDate) || (endDate !== null && !isDateOnly(endDate))) {
      throw new ValidationError('Contract dates must be valid calendar dates.');
    }
    if (endDate !== null && endDate <= startDate) {
      throw new ValidationError('Contract end date must be after its start date.');
    }
    return new ContractPeriod(startDate, endDate);
  }
}
