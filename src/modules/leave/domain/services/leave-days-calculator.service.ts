import { ValidationError } from '../../../../shared/errors/app.error';
import { LeavePeriod, eachDate } from '../value-objects/leave-period.vo';

export type CalendarDayType = 'WORKING_DAY' | 'NON_WORKING_DAY';

export interface WorkCalendar {
  /** Dias da semana considerados úteis (0 = domingo … 6 = sábado). */
  workingWeekdays: number[];
  /** Excepções pontuais: feriados/dias de descanso/dias úteis especiais. */
  exceptions: Record<string, CalendarDayType>;
}

/** Calendar laboral por omissão: segunda a sexta-feira. */
export const DEFAULT_WORK_CALENDAR: WorkCalendar = {
  workingWeekdays: [1, 2, 3, 4, 5],
  exceptions: {},
};

/**
 * Calcula a duração útil de um período segundo o calendário
 * laboral (RN-016 / RF-039).
 *
 * - `exceptions` tem precedência sobre `workingWeekdays`;
 * - dias sem excepção usam o padrão da semana de trabalho;
 * - um período sem dias úteis é recusado (o pedido não teria
 *   duração calculável).
 */
export class LeaveDaysCalculator {
  constructor(private readonly calendar: WorkCalendar = DEFAULT_WORK_CALENDAR) {}

  countWorkingDays(startDate: string, endDate: string): number {
    LeavePeriod.create(startDate, endDate);

    const workingWeekdays = new Set(this.calendar.workingWeekdays);
    let count = 0;

    for (const date of eachDate(startDate, endDate)) {
      const exception = this.calendar.exceptions[date];
      if (exception !== undefined) {
        if (exception === 'WORKING_DAY') count += 1;
        continue;
      }
      const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
      if (workingWeekdays.has(weekday)) count += 1;
    }

    if (count === 0) {
      throw new ValidationError('The selected period contains no working days.');
    }
    return count;
  }
}
