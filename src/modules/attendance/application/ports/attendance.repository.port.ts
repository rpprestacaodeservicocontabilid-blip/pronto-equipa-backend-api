import { AttendanceEntityType } from '../../domain/attendance-entity-type';
interface AttendanceEntityView {
  id: string;
  status: string;
  version: number;
  data: Record<string, unknown>;
  type: string;
}
interface PunchView {
  id: string;
  employeeId: string;
  workDate: string;
  punchType: string;
}
type PunchInputDto = {
  employeeId: string;
  punchType: string;
  occurredAt: string;
  workDate?: string;
  source?: string;
  externalReference?: string;
  idempotencyKey?: string;
  deviceId?: string;
  metadata?: Record<string, unknown>;
};
/** Operation inputs and opaque read results; no ORM types cross this boundary. */
export interface AttendanceRepositoryPort {
  createPunch(companyId: number, actorUserId: number, input: PunchInputDto): Promise<PunchView>;
  listPunches(
    companyId: number,
    query: {
      employeeId?: string;
      from?: string;
      to?: string;
      page: number;
      limit: number;
    },
  ): Promise<object>;
  getPunch(companyId: number, recordId: string): Promise<object>;
  recalculateDay(
    companyId: number,
    actorUserId: number,
    employeeId: string,
    workDate: string,
  ): Promise<AttendanceEntityView>;
  listDays(
    companyId: number,
    query: {
      employeeId?: string;
      from?: string;
      to?: string;
      page: number;
      limit: number;
    },
  ): Promise<object>;
  getEntity(companyId: number, id: string, type: AttendanceEntityType): Promise<object>;
  getCorrection(companyId: number, id: string): Promise<object>;
  createJustification(
    companyId: number,
    actorUserId: number,
    occurrenceId: string,
    reason: string,
    evidence?: string,
  ): Promise<AttendanceEntityView>;
  decideJustification(
    companyId: number,
    actorUserId: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
    reason?: string,
  ): Promise<object>;
  requestCorrection(
    companyId: number,
    actorUserId: number,
    recordId: string,
    changes: {
      punchType?: string;
      occurredAt?: string;
      reason: string;
    },
  ): Promise<AttendanceEntityView>;
  requestRectification(
    companyId: number,
    actorUserId: number,
    periodId: string,
    recordId: string,
    changes: {
      punchType?: string;
      occurredAt?: string;
      reason: string;
    },
  ): Promise<AttendanceEntityView>;
  decideCorrection(
    companyId: number,
    actorUserId: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string,
  ): Promise<AttendanceEntityView>;
  createPeriod(
    companyId: number,
    actorUserId: number,
    startDate: string,
    endDate: string,
  ): Promise<AttendanceEntityView>;
  closePeriod(
    companyId: number,
    actorUserId: number,
    periodId: string,
  ): Promise<{ period: AttendanceEntityView; snapshot?: AttendanceEntityView | null }>;
  validatePeriod(
    companyId: number,
    actorUserId: number,
    periodId: string,
  ): Promise<{ period: AttendanceEntityView; pendingByType: unknown }>;
  getPeriod(companyId: number, periodId: string): Promise<object>;
  listSnapshots(companyId: number, periodId: string): Promise<object>;
  attendanceSummary(companyId: number, from: string, to: string): Promise<object>;
  listEntities(
    companyId: number,
    type: AttendanceEntityType | AttendanceEntityType[],
    query: {
      employeeId?: string;
      status?: string;
      from?: string;
      to?: string;
      page: number;
      limit: number;
    },
  ): Promise<object>;
  setPolicy(
    companyId: number,
    actorUserId: number,
    input: {
      lateToleranceMinutes: number;
      earlyDepartureToleranceMinutes: number;
      separationOfDuties: boolean;
    },
  ): Promise<AttendanceEntityView>;
  importPunches(
    companyId: number,
    actorUserId: number,
    rows: PunchInputDto[],
    batchKey: string,
  ): Promise<{ batch: AttendanceEntityView }>;
}
