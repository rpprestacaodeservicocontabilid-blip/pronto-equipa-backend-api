import { ConflictError, ValidationError } from '../../../../shared/errors/app.error';
import { AllocationPercentage } from '../value-objects/allocation-percentage.vo';
import { DateRange } from '../value-objects/date-range.vo';

export type OrganizationEntityType =
  | 'DEPARTMENT'
  | 'JOB_FUNCTION'
  | 'JOB_POSITION'
  | 'PROFESSIONAL_CATEGORY'
  | 'COST_CENTER'
  | 'COST_ALLOCATION'
  | 'ESTABLISHMENT'
  | 'WORK_CALENDAR'
  | 'CALENDAR_EXCEPTION'
  | 'WORK_SCHEDULE'
  | 'WORK_SHIFT'
  | 'SCHEDULE_ASSIGNMENT'
  | 'DEPARTMENT_ASSIGNMENT';

export interface OrganizationRecord {
  id: string;
  companyId: number;
  type: OrganizationEntityType;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  parentId: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  version: number;
  data: Record<string, unknown>;
}

export const validateHierarchy = (
  entityId: string | null,
  parentId: string | null,
  ancestors: string[],
): void => {
  if (!parentId) return;
  if (entityId === parentId || ancestors.includes(parentId)) {
    throw new ConflictError('Organizational hierarchy cannot contain a cycle.');
  }
};

export const validateScheduleShifts = (
  shifts: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
    crossesMidnight?: boolean;
    breakMinutes?: number;
  }>,
): void => {
  for (const shift of shifts) {
    const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    if (
      !Number.isInteger(shift.weekday) ||
      shift.weekday < 0 ||
      shift.weekday > 6 ||
      !validTime(shift.startTime) ||
      !validTime(shift.endTime) ||
      !Number.isInteger(shift.breakMinutes ?? 0) ||
      (shift.breakMinutes ?? 0) < 0
    ) {
      throw new ValidationError('Work shift contains an invalid weekday, time, or break duration.');
    }
    if (shift.endTime <= shift.startTime && !shift.crossesMidnight) {
      throw new ValidationError('Overnight shifts must be explicitly marked as crossing midnight.');
    }
    const duration =
      toMinutes(shift.endTime) + (shift.crossesMidnight ? 1440 : 0) - toMinutes(shift.startTime);
    if ((shift.breakMinutes ?? 0) >= duration) {
      throw new ValidationError('Break duration must be shorter than the shift.');
    }
  }

  const weekMinutes = 7 * 1440;
  for (let first = 0; first < shifts.length; first += 1) {
    for (let second = first + 1; second < shifts.length; second += 1) {
      const a = shifts[first];
      const b = shifts[second];
      const aStart = a.weekday * 1440 + toMinutes(a.startTime);
      const aEnd = a.weekday * 1440 + toMinutes(a.endTime) + (a.crossesMidnight ? 1440 : 0);
      const bStart = b.weekday * 1440 + toMinutes(b.startTime);
      const bEnd = b.weekday * 1440 + toMinutes(b.endTime) + (b.crossesMidnight ? 1440 : 0);
      const overlaps = [-weekMinutes, 0, weekMinutes].some((offset) => {
        const shiftedStart = bStart + offset;
        const shiftedEnd = bEnd + offset;
        return aStart < shiftedEnd && shiftedStart < aEnd;
      });
      if (overlaps) throw new ConflictError('Work shifts cannot overlap.');
    }
  }
};

export const validateDateRange = (from: string, to: string | null) => DateRange.create(from, to);
export const validateAllocation = (values: Array<number | string>) =>
  AllocationPercentage.assertTotal100(values);

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};
