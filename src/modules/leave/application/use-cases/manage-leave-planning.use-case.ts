import { LeaveRepository } from '../../domain/repositories/leave.repository';
import {
  LeaveConflict,
  LeaveConflictDetector,
} from '../../domain/services/leave-conflict-detector.service';
import { LeaveDaysCalculator } from '../../domain/services/leave-days-calculator.service';
import { BLOCKING_LEAVE_STATUSES } from '../../domain/value-objects/leave-status.vo';
import { WorkCalendarReader } from '../ports/work-calendar-reader.port';

/**
 * Caso de uso de PLANEAMENTO: disponibilidade, conflitos e
 * ausências simultâneas (RN-017 / RF-034..037).
 *
 * Consultas puras — nenhuma escrita, por isso não há auditoria
 * nem transacção. O calendário laboral vem do módulo
 * `organization` (com fallback seg..sex. no adaptador).
 */
export class ManageLeavePlanningUseCase {
  constructor(
    private readonly repository: LeaveRepository,
    private readonly calendars: WorkCalendarReader,
  ) {}

  /** Calendário efectivo + dias úteis do intervalo (RF-034/035). */
  async getCalendar(
    companyId: number,
    startDate: string,
    endDate: string,
    scope?: { departmentId?: number | null; establishmentId?: string | null },
  ) {
    const calendar = await this.calendars.getCalendar(companyId, startDate, endDate, scope);
    const calculator = new LeaveDaysCalculator(calendar);
    const workingDays = calculator.countWorkingDays(startDate, endDate);
    return {
      calendar,
      startDate,
      endDate,
      workingDays,
    };
  }

  /** Conflitos de sobreposição de um trabalhador num intervalo (RN-017). */
  async findConflicts(input: {
    companyId: number;
    employeeId: string;
    startDate: string;
    endDate: string;
    excludeRequestId?: string;
  }): Promise<LeaveConflict[]> {
    const existing = await this.repository.findOverlappingPeriods(
      input.companyId,
      input.employeeId,
      input.startDate,
      input.endDate,
      input.excludeRequestId,
    );

    return LeaveConflictDetector.findConflicts(
      [{ startDate: input.startDate, endDate: input.endDate }],
      existing,
      BLOCKING_LEAVE_STATUSES,
    );
  }

  /**
   * Trabalhadores em férias numa data (indisponibilidade
   * simultânea — RF-037 / CA-006).
   */
  async findAbsencesOnDate(companyId: number, date: string) {
    const absences = await this.repository.findAbsencesOnDate(companyId, date);

    const grouped = new Map<string, Array<{ startDate: string; endDate: string }>>();
    for (const absence of absences) {
      const periods = grouped.get(absence.employeeId) ?? [];
      periods.push({ startDate: absence.startDate, endDate: absence.endDate });
      grouped.set(absence.employeeId, periods);
    }

    const employees = Array.from(grouped, ([employeeId, periods]) => ({ employeeId, periods }));
    const absentEmployeeIds = LeaveConflictDetector.findSimultaneousAbsences(employees, date);

    return absences.filter((absence) => absentEmployeeIds.includes(absence.employeeId));
  }
}
