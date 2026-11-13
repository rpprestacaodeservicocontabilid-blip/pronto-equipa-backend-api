import { ValidationError } from '../../../../shared/errors/app.error';

/** Duração máxima defensiva de um período de férias (366 dias). */
const MAX_PERIOD_DAYS = 366;

export const isDateOnly = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

/** Duração em dias de calendário, inclusiva nos dois extremos. */
export const calendarDaysBetween = (startDate: string, endDate: string): number => {
  const [y1, m1, d1] = startDate.split('-').map(Number);
  const [y2, m2, d2] = endDate.split('-').map(Number);
  const from = Date.UTC(y1, m1 - 1, d1);
  const to = Date.UTC(y2, m2 - 1, d2);
  return Math.round((to - from) / 86_400_000) + 1;
};

/** Itera as datas de calendário de `startDate` a `endDate` (inclusive). */
export const eachDate = (startDate: string, endDate: string): string[] => {
  const [y1, m1, d1] = startDate.split('-').map(Number);
  const [y2, m2, d2] = endDate.split('-').map(Number);
  const cursor = Date.UTC(y1, m1 - 1, d1);
  const last = Date.UTC(y2, m2 - 1, d2);
  const dates: string[] = [];
  for (let time = cursor; time <= last; time += 86_400_000) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
};

/**
 * Período de férias: valida datas de calendário, ordem e duração.
 * As datas são sempre `YYYY-MM-DD` (DATEONLY) — sem fusos horários.
 */
export class LeavePeriod {
  private constructor(
    readonly startDate: string,
    readonly endDate: string,
  ) {}

  static create(startDate: string, endDate: string): LeavePeriod {
    if (!isDateOnly(startDate) || !isDateOnly(endDate)) {
      throw new ValidationError('Leave dates must be valid calendar dates.');
    }
    if (endDate < startDate) {
      throw new ValidationError('Leave end date cannot be before the start date.');
    }
    const days = calendarDaysBetween(startDate, endDate);
    if (days > MAX_PERIOD_DAYS) {
      throw new ValidationError(`Leave period cannot exceed ${MAX_PERIOD_DAYS} days.`);
    }
    return new LeavePeriod(startDate, endDate);
  }

  get calendarDays(): number {
    return calendarDaysBetween(this.startDate, this.endDate);
  }

  /** Sobreposição inclusiva entre dois períodos (RN-017). */
  overlaps(other: LeavePeriod): boolean {
    return this.startDate <= other.endDate && other.startDate <= this.endDate;
  }
}
