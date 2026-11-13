import { LeavePeriod } from '../value-objects/leave-period.vo';

export interface CandidatePeriod {
  startDate: string;
  endDate: string;
}

export interface ExistingPeriod {
  requestId: string;
  status: string;
  startDate: string;
  endDate: string;
}

export interface LeaveConflict {
  conflictingRequestId: string;
  conflictingStatus: string;
  overlapStart: string;
  overlapEnd: string;
}

/**
 * Detector de sobreposições e conflitos de disponibilidade
 * (RN-017 / RF-037 / CA-006).
 *
 * Compara um conjunto de períodos candidatos com os períodos já
 * comprometidos do mesmo trabalhador, devolvendo a intersecção
 * exacta de cada conflito.
 */
export class LeaveConflictDetector {
  static findConflicts(
    candidates: ReadonlyArray<CandidatePeriod>,
    existing: ReadonlyArray<ExistingPeriod>,
    blockingStatuses: ReadonlyArray<string>,
  ): LeaveConflict[] {
    const conflicts: LeaveConflict[] = [];

    for (const candidate of candidates) {
      const candidatePeriod = LeavePeriod.create(candidate.startDate, candidate.endDate);

      for (const period of existing) {
        if (!blockingStatuses.includes(period.status)) continue;

        const existingPeriod = LeavePeriod.create(period.startDate, period.endDate);
        if (!candidatePeriod.overlaps(existingPeriod)) continue;

        const overlapStart =
          candidatePeriod.startDate > existingPeriod.startDate
            ? candidatePeriod.startDate
            : existingPeriod.startDate;
        const overlapEnd =
          candidatePeriod.endDate < existingPeriod.endDate
            ? candidatePeriod.endDate
            : existingPeriod.endDate;

        conflicts.push({
          conflictingRequestId: period.requestId,
          conflictingStatus: period.status,
          overlapStart,
          overlapEnd,
        });
      }
    }

    return conflicts;
  }

  /** Indisponibilidade simultânea: trabalhadores em férias na mesma data. */
  static findSimultaneousAbsences(
    byEmployee: ReadonlyArray<{ employeeId: string; periods: ReadonlyArray<CandidatePeriod> }>,
    date: string,
  ): string[] {
    return byEmployee
      .filter((entry) =>
        entry.periods.some((period) => period.startDate <= date && date <= period.endDate),
      )
      .map((entry) => entry.employeeId);
  }
}
