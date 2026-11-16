import { Op } from 'sequelize';
import { OrganizationRecordModel } from '../../../organization/infrastructure/persistence/models/organization-record.model';
import { WorkCalendarReader } from '../../application/ports/work-calendar-reader.port';
import {
  CalendarDayType,
  DEFAULT_WORK_CALENDAR,
  WorkCalendar,
} from '../../domain/services/leave-days-calculator.service';

/**
 * Adaptador do calendário laboral (módulo `organization`).
 *
 * Fonte: registos `WORK_CALENDAR` activos e os seus filhos
 * `CALENDAR_EXCEPTION` (feriados/descansos/dias úteis especiais).
 *
 * Fallbacks:
 *   - sem calendário activo no intervalo → semana-padrão
 *     segunda..sexta (`DEFAULT_WORK_CALENDAR`);
 *   - `dayType` `HOLIDAY`/`REST_DAY`/`SPECIAL` → não útil;
 *     `WORKING_DAY` → útil (excepção com precedência).
 *
 * O `scope.establishmentId` escolhe o calendário do
 * estabelecimento (RF-035); `departmentId` é ignorado porque os
 * calendários organizacionais não têm escopo de departamento.
 */
export class SequelizeWorkCalendarReader implements WorkCalendarReader {
  async getCalendar(
    companyId: number,
    startDate: string,
    endDate: string,
    scope?: { departmentId?: number | null; establishmentId?: string | null },
  ): Promise<WorkCalendar> {
    const rows = await OrganizationRecordModel.findAll({
      where: {
        companyId,
        type: 'WORK_CALENDAR',
        status: 'ACTIVE',
      },
      order: [['effectiveFrom', 'DESC']],
    });

    // Activos no intervalo (effectiveFrom ≤ fim E effectiveTo ≥ início).
    const covering = rows.filter((row) => {
      const from = row.effectiveFrom ? String(row.effectiveFrom).slice(0, 10) : null;
      const to = row.effectiveTo ? String(row.effectiveTo).slice(0, 10) : null;
      if (from && from > endDate) return false;
      if (to && to < startDate) return false;
      return true;
    });

    if (covering.length === 0) return { ...DEFAULT_WORK_CALENDAR, exceptions: {} };

    const chosen =
      (scope?.establishmentId
        ? covering.find(
            (row) =>
              (row.data as { establishmentId?: string } | null)?.establishmentId ===
              scope.establishmentId,
          )
        : undefined) ?? covering[0];

    const workingWeekdays = readWorkingWeekdays(chosen.data);

    const exceptions: Record<string, CalendarDayType> = {};
    const exceptionRows = await OrganizationRecordModel.findAll({
      where: {
        companyId,
        type: 'CALENDAR_EXCEPTION',
        status: 'ACTIVE',
        parentId: chosen.id,
        effectiveFrom: { [Op.lte]: endDate },
        [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: startDate } }],
      },
      order: [['effectiveFrom', 'ASC']],
    });

    for (const row of exceptionRows) {
      const from = String(row.effectiveFrom).slice(0, 10);
      const to = row.effectiveTo ? String(row.effectiveTo).slice(0, 10) : from;
      const dayType = mapDayType((row.data as { dayType?: string } | null)?.dayType);
      for (const date of eachDateInRange(from, to, startDate, endDate)) {
        exceptions[date] = dayType;
      }
    }

    return { workingWeekdays, exceptions };
  }
}

const mapDayType = (dayType: string | undefined): CalendarDayType => {
  switch (dayType) {
    case 'WORKING_DAY':
      return 'WORKING_DAY';
    case 'HOLIDAY':
    case 'REST_DAY':
    case 'SPECIAL':
    default:
      return 'NON_WORKING_DAY';
  }
};

const readWorkingWeekdays = (data: unknown): number[] => {
  const weekdays = (data as { workingWeekdays?: unknown } | null)?.workingWeekdays;
  if (Array.isArray(weekdays)) {
    const valid = weekdays
      .filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
      .sort((a, b) => a - b);
    if (valid.length > 0) return valid;
  }
  return [...DEFAULT_WORK_CALENDAR.workingWeekdays];
};

/** Datas da excepção intersectadas com o intervalo pedido. */
const eachDateInRange = (
  from: string,
  to: string,
  rangeStart: string,
  rangeEnd: string,
): string[] => {
  const start = from > rangeStart ? from : rangeStart;
  const end = to < rangeEnd ? to : rangeEnd;
  const dates: string[] = [];
  if (start > end) return dates;

  let cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cursor.getTime() <= last.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return dates;
};
