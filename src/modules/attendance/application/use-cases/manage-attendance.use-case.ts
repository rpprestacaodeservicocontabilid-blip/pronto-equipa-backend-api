import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { AttendanceEntityType } from '../../infrastructure/persistence/model/attendance-entity.model';
import { SequelizeAttendanceRepository } from '../../infrastructure/persistence/repositories/sequelize-attendance.repository';

export class ManageAttendanceUseCase {
  constructor(
    private readonly repository: SequelizeAttendanceRepository,
    private readonly audit: AuditRecorderPort,
  ) {}

  async recordPunch(
    companyId: number,
    actorUserId: number,
    input: Parameters<SequelizeAttendanceRepository['createPunch']>[2],
  ) {
    const result = await this.repository.createPunch(companyId, actorUserId, input);
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'attendance.punch.recorded',
      entityType: 'attendance_punch',
      entityId: result.id,
      after: {
        employeeId: result.employeeId,
        workDate: result.workDate,
        punchType: result.punchType,
      },
    });
    return result;
  }

  listPunches(
    companyId: number,
    query: Parameters<SequelizeAttendanceRepository['listPunches']>[1],
  ) {
    return this.repository.listPunches(companyId, query);
  }

  getPunch(companyId: number, recordId: string) {
    return this.repository.getPunch(companyId, recordId);
  }

  async recalculateDay(
    companyId: number,
    actorUserId: number,
    employeeId: string,
    workDate: string,
  ) {
    const result = await this.repository.recalculateDay(
      companyId,
      actorUserId,
      employeeId,
      workDate,
    );
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'attendance.day.calculated',
      entityType: 'attendance_day',
      entityId: result.id,
      after: { employeeId, workDate, status: result.status, version: result.version },
    });
    return result;
  }

  listDays(companyId: number, query: Parameters<SequelizeAttendanceRepository['listDays']>[1]) {
    return this.repository.listDays(companyId, query);
  }

  getEntity(companyId: number, id: string, type: AttendanceEntityType) {
    return this.repository.getEntity(companyId, id, type);
  }

  getCorrection(companyId: number, id: string) {
    return this.repository.getCorrection(companyId, id);
  }

  async createJustification(
    companyId: number,
    actorUserId: number,
    occurrenceId: string,
    reason: string,
    evidence?: string,
  ) {
    const result = await this.repository.createJustification(
      companyId,
      actorUserId,
      occurrenceId,
      reason,
      evidence,
    );
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'attendance.justification.submitted',
      entityType: 'attendance_justification',
      entityId: result.id,
      after: { occurrenceId },
    });
    return result;
  }

  async decideJustification(
    companyId: number,
    actorUserId: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
    reason?: string,
  ) {
    const result = await this.repository.decideJustification(
      companyId,
      actorUserId,
      id,
      decision,
      reason,
    );
    await this.audit.record({
      companyId,
      actorUserId,
      action: `attendance.justification.${decision.toLowerCase()}`,
      entityType: 'attendance_justification',
      entityId: id,
      after: { decision, reason },
    });
    return result;
  }

  async requestCorrection(
    companyId: number,
    actorUserId: number,
    recordId: string,
    changes: { punchType?: string; occurredAt?: string; reason: string },
  ) {
    const result = await this.repository.requestCorrection(
      companyId,
      actorUserId,
      recordId,
      changes,
    );
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'attendance.correction.requested',
      entityType: 'attendance_correction',
      entityId: result.id,
      after: { recordId, reason: changes.reason },
    });
    return result;
  }

  async requestRectification(
    companyId: number,
    actorUserId: number,
    periodId: string,
    recordId: string,
    changes: { punchType?: string; occurredAt?: string; reason: string },
  ) {
    const result = await this.repository.requestRectification(
      companyId,
      actorUserId,
      periodId,
      recordId,
      changes,
    );
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'attendance.rectification.requested',
      entityType: 'attendance_rectification',
      entityId: result.id,
      after: { periodId, recordId },
    });
    return result;
  }

  async decideCorrection(
    companyId: number,
    actorUserId: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    const result = await this.repository.decideCorrection(
      companyId,
      actorUserId,
      id,
      decision,
      reason,
    );
    const rectification = result.type === 'RECTIFICATION';
    await this.audit.record({
      companyId,
      actorUserId,
      action: `attendance.${rectification ? 'rectification' : 'correction'}.${decision.toLowerCase()}`,
      entityType: rectification ? 'attendance_rectification' : 'attendance_correction',
      entityId: id,
      after: { decision, reason },
    });
    return result;
  }

  async createPeriod(companyId: number, actorUserId: number, startDate: string, endDate: string) {
    const result = await this.repository.createPeriod(companyId, actorUserId, startDate, endDate);
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'attendance.period.opened',
      entityType: 'attendance_period',
      entityId: result.id,
      after: { startDate, endDate },
    });
    return result;
  }

  async closePeriod(companyId: number, actorUserId: number, periodId: string) {
    const result = await this.repository.closePeriod(companyId, actorUserId, periodId);
    if (result.snapshot) {
      await this.audit.record({
        companyId,
        actorUserId,
        action: 'attendance.period.closed',
        entityType: 'attendance_period',
        entityId: periodId,
        after: { snapshotId: result.snapshot.id },
      });
    }
    return result;
  }

  async validatePeriod(companyId: number, actorUserId: number, periodId: string) {
    const result = await this.repository.validatePeriod(companyId, actorUserId, periodId);
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'attendance.period.validated',
      entityType: 'attendance_period',
      entityId: periodId,
      after: { status: result.period.status, pendingByType: result.pendingByType },
    });
    return result;
  }

  getPeriod(companyId: number, periodId: string) {
    return this.repository.getPeriod(companyId, periodId);
  }

  listSnapshots(companyId: number, periodId: string) {
    return this.repository.listSnapshots(companyId, periodId);
  }

  attendanceSummary(companyId: number, from: string, to: string) {
    return this.repository.attendanceSummary(companyId, from, to);
  }

  listEntities(
    companyId: number,
    type: AttendanceEntityType | AttendanceEntityType[],
    query: Parameters<SequelizeAttendanceRepository['listEntities']>[2],
  ) {
    return this.repository.listEntities(companyId, type, query);
  }

  async setPolicy(
    companyId: number,
    actorUserId: number,
    input: {
      lateToleranceMinutes: number;
      earlyDepartureToleranceMinutes: number;
      separationOfDuties: boolean;
    },
  ) {
    const result = await this.repository.setPolicy(companyId, actorUserId, input);
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'attendance.policy.changed',
      entityType: 'attendance_policy',
      entityId: result.id,
      after: { version: result.version, ...input },
    });
    return result;
  }

  async importPunches(
    companyId: number,
    actorUserId: number,
    rows: Parameters<SequelizeAttendanceRepository['importPunches']>[2],
    batchKey: string,
  ) {
    const result = await this.repository.importPunches(companyId, actorUserId, rows, batchKey);
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'attendance.import.completed',
      entityType: 'attendance_import',
      entityId: result.batch.id,
      after: { ...result.batch.data },
    });
    return result;
  }
}
