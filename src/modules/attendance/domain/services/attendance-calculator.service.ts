import { ConflictError } from '../../../../shared/errors/app.error';
import { PunchType } from '../value-objects/punch-type.vo';

export interface PunchInput {
  id: string;
  punchType: PunchType;
  occurredAt: Date;
}

export interface ExpectedShift {
  startAt: Date;
  endAt: Date;
  breakMinutes: number;
}

export interface AttendanceCalculation {
  workedMinutes: number;
  expectedMinutes: number;
  status: 'PRESENT' | 'PARTIAL' | 'ABSENT' | 'REST_DAY' | 'INCOMPLETE';
  occurrences: Array<{
    type: string;
    durationMinutes: number;
    status: string;
    data: Record<string, unknown>;
  }>;
}

const minutesBetween = (start: Date, end: Date): number =>
  Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));

export class AttendanceCalculator {
  calculate(
    punches: PunchInput[],
    shift: ExpectedShift | null,
    tolerances: { lateMinutes: number; earlyDepartureMinutes: number; version: number },
  ): AttendanceCalculation {
    const sorted = [...punches].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const occurrences: AttendanceCalculation['occurrences'] = [];
    let activeIn: Date | null = null;
    let activeBreak: Date | null = null;
    let workedMinutes = 0;
    let recordedBreakMinutes = 0;
    let invalidSequence = false;

    for (const punch of sorted) {
      if (punch.punchType === 'IN') {
        if (activeIn || activeBreak) {
          invalidSequence = true;
          continue;
        }
        activeIn = punch.occurredAt;
      } else if (punch.punchType === 'OUT') {
        if (!activeIn || activeBreak) {
          invalidSequence = true;
          continue;
        }
        workedMinutes += minutesBetween(activeIn, punch.occurredAt);
        activeIn = null;
      } else if (punch.punchType === 'BREAK_START') {
        if (!activeIn || activeBreak) {
          invalidSequence = true;
          continue;
        }
        activeBreak = punch.occurredAt;
      } else {
        if (!activeIn || !activeBreak) {
          invalidSequence = true;
          continue;
        }
        const breakMinutes = minutesBetween(activeBreak, punch.occurredAt);
        workedMinutes -= breakMinutes;
        recordedBreakMinutes += breakMinutes;
        activeBreak = null;
      }
    }

    if (activeIn || activeBreak) {
      occurrences.push({
        type: 'MISSING_PUNCH',
        durationMinutes: 0,
        status: 'PENDING',
        data: { missing: activeBreak ? 'BREAK_END_OR_OUT' : 'OUT' },
      });
    }
    if (invalidSequence) {
      occurrences.push({
        type: 'INCONSISTENT_PUNCHES',
        durationMinutes: 0,
        status: 'PENDING',
        data: { ruleVersion: tolerances.version },
      });
    }

    const expectedMinutes = shift
      ? Math.max(0, minutesBetween(shift.startAt, shift.endAt) - shift.breakMinutes)
      : 0;
    if (shift && recordedBreakMinutes === 0) {
      workedMinutes = Math.max(0, workedMinutes - shift.breakMinutes);
    }
    if (shift && sorted.length > 0) {
      const firstIn = sorted.find((punch) => punch.punchType === 'IN');
      if (firstIn) {
        const late = minutesBetween(shift.startAt, firstIn.occurredAt);
        if (late > tolerances.lateMinutes) {
          occurrences.push({
            type: 'LATE_ARRIVAL',
            durationMinutes: late,
            status: 'PENDING',
            data: { toleranceMinutes: tolerances.lateMinutes, ruleVersion: tolerances.version },
          });
        }
      }
      const lastOut = [...sorted].reverse().find((punch) => punch.punchType === 'OUT');
      if (lastOut) {
        const early = minutesBetween(lastOut.occurredAt, shift.endAt);
        if (early > tolerances.earlyDepartureMinutes) {
          occurrences.push({
            type: 'EARLY_DEPARTURE',
            durationMinutes: early,
            status: 'PENDING',
            data: {
              toleranceMinutes: tolerances.earlyDepartureMinutes,
              ruleVersion: tolerances.version,
            },
          });
        }
      }
    }

    if (!shift) {
      return {
        workedMinutes,
        expectedMinutes: 0,
        status: sorted.length ? (activeIn ? 'INCOMPLETE' : 'PRESENT') : 'REST_DAY',
        occurrences,
      };
    }
    if (!sorted.length) {
      occurrences.push({
        type: 'ABSENCE_UNCLASSIFIED',
        durationMinutes: expectedMinutes,
        status: 'PENDING',
        data: { ruleVersion: tolerances.version },
      });
    }
    return {
      workedMinutes,
      expectedMinutes,
      status: !sorted.length
        ? 'ABSENT'
        : activeIn
          ? 'INCOMPLETE'
          : workedMinutes >= expectedMinutes
            ? 'PRESENT'
            : 'PARTIAL',
      occurrences,
    };
  }

  validatePunchSequence(punches: PunchInput[]): void {
    let activeIn = false;
    let activeBreak = false;
    for (const punch of [...punches].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
    )) {
      if (punch.punchType === 'IN') {
        if (activeIn) throw new ConflictError('An IN punch is already open for this work date.');
        activeIn = true;
      } else if (punch.punchType === 'OUT') {
        if (!activeIn || activeBreak)
          throw new ConflictError('OUT punch requires an open work interval.');
        activeIn = false;
      } else if (punch.punchType === 'BREAK_START') {
        if (!activeIn || activeBreak)
          throw new ConflictError('BREAK_START requires an open work interval.');
        activeBreak = true;
      } else {
        if (!activeBreak || !activeIn) throw new ConflictError('BREAK_END requires an open break.');
        activeBreak = false;
      }
    }
  }
}
