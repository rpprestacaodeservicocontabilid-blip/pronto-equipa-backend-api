import { randomUUID } from 'crypto';
import { Op, QueryTypes, Transaction, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../../../shared/errors/app.error';
import { EmployeeModel } from '../../../../employees/infrastructure/persistence/model/employee.model';
import { CompanyModel } from '../../../../tenancy/infrastructure/persistence/model/company.model';
import { OrganizationRecordModel } from '../../../../organization/infrastructure/persistence/model/organization-record.model';
import {
  AttendanceCalculator,
  AttendanceCalculation,
  ExpectedShift,
  PunchInput,
} from '../../../domain/services/attendance-calculator.service';
import { AttendanceEntityModel, AttendanceEntityType } from '../model/attendance-entity.model';
import { AttendanceOutboxModel } from '../model/attendance-outbox.model';
import { AttendanceRecordModel } from '../model/attendance-record.model';

type Entity = AttendanceEntityModel;
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

const now = (): Date => new Date();
const dateOnly = (value: string | Date): string => String(value).slice(0, 10);
const assertDate = (value: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError('A valid date in YYYY-MM-DD format is required.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ValidationError('A valid date in YYYY-MM-DD format is required.');
  }
};

const localDate = (date: Date, timezone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string): string => parts.find((value) => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const zonedDateTime = (date: string, time: string, timezone: string): Date => {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(guess));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
  );
  return new Date(guess + (guess - localAsUtc));
};

const mapPunch = (row: AttendanceRecordModel): PunchInput => ({
  id: row.id,
  punchType: row.punchType,
  occurredAt: row.occurredAt,
});

const withTenant = async <T>(
  companyId: number,
  operation: (transaction: Transaction) => Promise<T>,
): Promise<T> =>
  sequelize.transaction(async (transaction) => {
    if (sequelize.getDialect() === 'postgres') {
      await sequelize.query("SELECT set_config('app.current_tenant', :companyId, true)", {
        replacements: { companyId: String(companyId) },
        type: QueryTypes.SELECT,
        transaction,
      });
    }
    return operation(transaction);
  });

export class SequelizeAttendanceRepository {
  private readonly calculator = new AttendanceCalculator();

  async createPunch(companyId: number, actorUserId: number, input: PunchInputDto) {
    const occurredAt = new Date(input.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) throw new ValidationError('Invalid punch timestamp.');
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const employee = await EmployeeModel.findOne({
        where: { id: input.employeeId, companyId },
        attributes: ['id'],
        transaction,
      });
      if (!employee) throw new NotFoundError('Employee');
      const company = await CompanyModel.findByPk(companyId, {
        attributes: ['timezone'],
        transaction,
      });
      if (!company) throw new NotFoundError('Company');
      const timezone = company.timezone;
      const workDate = input.workDate ?? localDate(occurredAt, timezone);
      assertDate(workDate);
      if (input.idempotencyKey) {
        const existing = await AttendanceRecordModel.findOne({
          where: {
            companyId,
            source: input.source ?? 'MANUAL',
            idempotencyKey: input.idempotencyKey,
          },
          transaction,
        });
        if (existing) {
          if (
            existing.employeeId !== input.employeeId ||
            existing.punchType !== input.punchType ||
            existing.occurredAt.getTime() !== occurredAt.getTime() ||
            (input.workDate !== undefined && existing.workDate !== input.workDate)
          ) {
            throw new ConflictError('The idempotency key was already used for a different punch.');
          }
          return existing;
        }
      }
      await this.assertOpenDay(companyId, input.employeeId, workDate, transaction);
      const record = await AttendanceRecordModel.create(
        {
          id: randomUUID(),
          companyId,
          employeeId: input.employeeId,
          punchType: input.punchType as never,
          occurredAt,
          workDate,
          timezone,
          source: input.source ?? 'MANUAL',
          externalReference: input.externalReference ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          deviceId: input.deviceId ?? null,
          correctionOfId: null,
          metadata: input.metadata ?? {},
          createdBy: actorUserId,
          createdAt: now(),
        },
        { transaction },
      );
      await this.invalidateDay(companyId, input.employeeId, workDate, transaction);
      await this.writeEvent(transaction, companyId, record.id, 'attendance.punch.recorded', {
        employeeId: record.employeeId,
        workDate,
        punchType: record.punchType,
      });
      return record;
    }).catch((error: unknown) => {
      if (error instanceof UniqueConstraintError)
        throw new ConflictError('Punch idempotency key or external reference already exists.');
      throw error;
    });
  }

  async listPunches(
    companyId: number,
    query: { employeeId?: string; from?: string; to?: string; page: number; limit: number },
  ) {
    const where: Record<string, unknown> = { companyId };
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.from || query.to) {
      where.workDate = {
        ...(query.from ? { [Op.gte]: query.from } : {}),
        ...(query.to ? { [Op.lte]: query.to } : {}),
      };
    }
    return withTenant(companyId, async (transaction) => {
      const result = await AttendanceRecordModel.findAndCountAll({
        where,
        order: [['occurredAt', 'DESC']],
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        transaction,
      });
      return { data: result.rows, total: result.count, page: query.page, limit: query.limit };
    });
  }

  async getPunch(companyId: number, recordId: string) {
    return withTenant(companyId, async (transaction) => {
      const record = await AttendanceRecordModel.findOne({
        where: { id: recordId, companyId },
        transaction,
      });
      if (!record) throw new NotFoundError('Attendance punch');
      return record;
    });
  }

  async recalculateDay(
    companyId: number,
    actorUserId: number,
    employeeId: string,
    workDate: string,
  ) {
    assertDate(workDate);
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      await this.assertEmployee(companyId, employeeId, transaction);
      await this.assertOpenDay(companyId, employeeId, workDate, transaction);
      const records = await AttendanceRecordModel.findAll({
        where: { companyId, employeeId, workDate },
        order: [['occurredAt', 'ASC']],
        transaction,
      });
      const corrections = await AttendanceRecordModel.findAll({
        where: {
          companyId,
          employeeId,
          source: 'CORRECTION',
          [Op.or]: [
            { workDate },
            ...(records.length
              ? [{ correctionOfId: { [Op.in]: records.map((record) => record.id) } }]
              : []),
          ],
        },
        transaction,
      });
      const allDayRecords = [
        ...new Map([...records, ...corrections].map((record) => [record.id, record])).values(),
      ];
      const replacedRecordIds = new Set(
        corrections
          .map((record) => record.correctionOfId)
          .filter((id): id is string => id !== null),
      );
      const effectiveRecords = allDayRecords.filter(
        (record) => record.workDate === workDate && !replacedRecordIds.has(record.id),
      );
      const { shift, scheduleId } = await this.findExpectedShift(
        companyId,
        employeeId,
        workDate,
        transaction,
      );
      const policy = await this.getPolicy(companyId, transaction);
      const result = this.calculator.calculate(effectiveRecords.map(mapPunch), shift, {
        lateMinutes: policy.lateToleranceMinutes,
        earlyDepartureMinutes: policy.earlyDepartureToleranceMinutes,
        version: policy.version,
      });
      const existing = await AttendanceEntityModel.findOne({
        where: { companyId, type: 'DAY', employeeId, workDate },
        transaction,
      });
      const day = existing
        ? await existing.update(
            {
              status: result.status,
              version: existing.version + 1,
              data: {
                ...existing.data,
                ...result,
                recalculationNeeded: false,
                scheduleId,
                policyVersion: policy.version,
                calculatedAt: now().toISOString(),
                punchIds: effectiveRecords.map((record) => record.id),
              },
              updatedAt: now(),
            },
            { transaction },
          )
        : await AttendanceEntityModel.create(
            {
              id: randomUUID(),
              companyId,
              type: 'DAY',
              employeeId,
              parentId: null,
              workDate,
              periodStart: null,
              periodEnd: null,
              status: result.status,
              version: 1,
              idempotencyKey: null,
              uniqueDayKey: `${employeeId}:${workDate}`,
              data: {
                ...result,
                recalculationNeeded: false,
                scheduleId,
                policyVersion: policy.version,
                calculatedAt: now().toISOString(),
                punchIds: effectiveRecords.map((record) => record.id),
              },
              createdBy: actorUserId,
              createdAt: now(),
              updatedAt: now(),
            },
            { transaction },
          );
      const previousOccurrences = await AttendanceEntityModel.findAll({
        where: { companyId, type: 'OCCURRENCE', parentId: day.id },
        transaction,
      });
      const unmatched = new Map(
        previousOccurrences.map((occurrence) => [
          String(occurrence.data.occurrenceType),
          occurrence,
        ]),
      );
      for (const occurrence of result.occurrences) {
        const previous = unmatched.get(occurrence.type);
        if (previous) {
          unmatched.delete(occurrence.type);
          await previous.update(
            {
              status: previous.status === 'PENDING' ? occurrence.status : previous.status,
              version: previous.version + 1,
              data: {
                ...previous.data,
                durationMinutes: occurrence.durationMinutes,
                ...occurrence.data,
              },
              updatedAt: now(),
            },
            { transaction },
          );
        } else {
          await AttendanceEntityModel.create(
            {
              id: randomUUID(),
              companyId,
              type: 'OCCURRENCE',
              employeeId,
              parentId: day.id,
              workDate,
              periodStart: null,
              periodEnd: null,
              status: occurrence.status,
              version: 1,
              idempotencyKey: null,
              data: {
                occurrenceType: occurrence.type,
                durationMinutes: occurrence.durationMinutes,
                ...occurrence.data,
              },
              createdBy: actorUserId,
              createdAt: now(),
              updatedAt: now(),
            },
            { transaction },
          );
        }
      }
      for (const occurrence of unmatched.values()) {
        if (occurrence.status === 'PENDING') {
          await occurrence.update(
            { status: 'SUPERSEDED', version: occurrence.version + 1, updatedAt: now() },
            { transaction },
          );
        }
      }
      await this.writeEvent(transaction, companyId, day.id, 'attendance.day.calculated', {
        employeeId,
        workDate,
        status: result.status,
        workedMinutes: result.workedMinutes,
        expectedMinutes: result.expectedMinutes,
      });
      return { ...day.toJSON(), occurrences: result.occurrences };
    });
  }

  async listDays(
    companyId: number,
    query: { employeeId?: string; from?: string; to?: string; page: number; limit: number },
  ) {
    const where: Record<string, unknown> = { companyId, type: 'DAY' };
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.from || query.to)
      where.workDate = {
        ...(query.from ? { [Op.gte]: query.from } : {}),
        ...(query.to ? { [Op.lte]: query.to } : {}),
      };
    return withTenant(companyId, async (transaction) => {
      const result = await AttendanceEntityModel.findAndCountAll({
        where,
        order: [['workDate', 'DESC']],
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        transaction,
      });
      return { data: result.rows, total: result.count, page: query.page, limit: query.limit };
    });
  }

  async getEntity(companyId: number, id: string, type: AttendanceEntityType) {
    return withTenant(companyId, (transaction) =>
      this.requireEntity(companyId, id, type, transaction),
    );
  }

  async getCorrection(companyId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      const correction = await AttendanceEntityModel.findOne({
        where: { companyId, id, type: { [Op.in]: ['CORRECTION', 'RECTIFICATION'] } },
        transaction,
      });
      if (!correction) throw new NotFoundError('Attendance correction');
      return correction;
    });
  }

  async createJustification(
    companyId: number,
    actorUserId: number,
    occurrenceId: string,
    reason: string,
    evidence?: string,
  ) {
    return withTenant(companyId, async (transaction) => {
      const occurrence = await this.requireEntity(
        companyId,
        occurrenceId,
        'OCCURRENCE',
        transaction,
      );
      if (occurrence.status !== 'PENDING')
        throw new ConflictError('Only pending occurrences can be justified.');
      const row = await AttendanceEntityModel.create(
        {
          id: randomUUID(),
          companyId,
          type: 'JUSTIFICATION',
          employeeId: occurrence.employeeId,
          parentId: occurrence.id,
          workDate: occurrence.workDate,
          periodStart: null,
          periodEnd: null,
          status: 'PENDING',
          version: 1,
          idempotencyKey: null,
          data: { reason, evidence: evidence ?? null, submittedAt: now().toISOString() },
          createdBy: actorUserId,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      await this.writeEvent(transaction, companyId, row.id, 'attendance.justification.submitted', {
        occurrenceId,
      });
      return row;
    });
  }

  async decideJustification(
    companyId: number,
    actorUserId: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
    reason?: string,
  ) {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const justification = await this.requireEntity(
        companyId,
        id,
        'JUSTIFICATION',
        transaction,
        true,
      );
      if (justification.status !== 'PENDING')
        throw new ConflictError('Justification has already been decided.');
      const policy = await this.getPolicy(companyId, transaction);
      if (policy.separationOfDuties && justification.createdBy === actorUserId) {
        throw new ForbiddenError('A user cannot decide their own attendance justification.');
      }
      await justification.update(
        {
          status: decision,
          version: justification.version + 1,
          data: {
            ...justification.data,
            decision,
            decisionReason: reason ?? null,
            decidedBy: actorUserId,
            decidedAt: now().toISOString(),
          },
          updatedAt: now(),
        },
        { transaction },
      );
      const occurrence = await this.requireEntity(
        companyId,
        justification.parentId!,
        'OCCURRENCE',
        transaction,
      );
      await occurrence.update(
        {
          status: decision === 'RETURNED' ? 'PENDING' : decision,
          version: occurrence.version + 1,
          data: { ...occurrence.data, justificationId: id },
          updatedAt: now(),
        },
        { transaction },
      );
      await AttendanceEntityModel.create(
        {
          id: randomUUID(),
          companyId,
          type: 'DECISION',
          employeeId: justification.employeeId,
          parentId: justification.id,
          workDate: justification.workDate,
          periodStart: null,
          periodEnd: null,
          status: decision,
          version: 1,
          idempotencyKey: null,
          data: { reason: reason ?? null, decidedBy: actorUserId, decidedAt: now().toISOString() },
          createdBy: actorUserId,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      await this.writeEvent(
        transaction,
        companyId,
        justification.id,
        `attendance.justification.${decision.toLowerCase()}`,
        { occurrenceId: occurrence.id },
      );
      return justification;
    });
  }

  async requestCorrection(
    companyId: number,
    actorUserId: number,
    recordId: string,
    changes: { punchType?: string; occurredAt?: string; reason: string },
  ) {
    return withTenant(companyId, async (transaction) => {
      const original = await AttendanceRecordModel.findOne({
        where: { id: recordId, companyId },
        transaction,
      });
      if (!original) throw new NotFoundError('Attendance punch');
      await this.assertOpenDay(companyId, original.employeeId, original.workDate, transaction);
      const row = await AttendanceEntityModel.create(
        {
          id: randomUUID(),
          companyId,
          type: 'CORRECTION',
          employeeId: original.employeeId,
          parentId: original.id,
          workDate: original.workDate,
          periodStart: null,
          periodEnd: null,
          status: 'PENDING',
          version: 1,
          idempotencyKey: null,
          data: {
            requestedPunchType: changes.punchType ?? original.punchType,
            requestedOccurredAt: changes.occurredAt ?? original.occurredAt.toISOString(),
            reason: changes.reason,
            originalPunchType: original.punchType,
            originalOccurredAt: original.occurredAt.toISOString(),
          },
          createdBy: actorUserId,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      await this.writeEvent(transaction, companyId, row.id, 'attendance.correction.requested', {
        recordId,
      });
      return row;
    });
  }

  async requestRectification(
    companyId: number,
    actorUserId: number,
    periodId: string,
    recordId: string,
    changes: { punchType?: string; occurredAt?: string; reason: string },
  ) {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const period = await this.requireEntity(companyId, periodId, 'PERIOD', transaction, true);
      if (!['CLOSED', 'RECTIFICATION_PENDING'].includes(period.status)) {
        throw new ConflictError('Rectifications are only allowed for a closed attendance period.');
      }
      const original = await AttendanceRecordModel.findOne({
        where: { id: recordId, companyId },
        transaction,
      });
      if (
        !original ||
        original.workDate < period.periodStart! ||
        original.workDate > period.periodEnd!
      ) {
        throw new NotFoundError('Attendance punch in closed period');
      }
      const row = await AttendanceEntityModel.create(
        {
          id: randomUUID(),
          companyId,
          type: 'RECTIFICATION',
          employeeId: original.employeeId,
          parentId: original.id,
          workDate: original.workDate,
          periodStart: null,
          periodEnd: null,
          status: 'PENDING',
          version: 1,
          idempotencyKey: null,
          data: {
            periodId,
            requestedPunchType: changes.punchType ?? original.punchType,
            requestedOccurredAt: changes.occurredAt ?? original.occurredAt.toISOString(),
            reason: changes.reason,
            originalPunchType: original.punchType,
            originalOccurredAt: original.occurredAt.toISOString(),
          },
          createdBy: actorUserId,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      await period.update(
        {
          status: 'RECTIFICATION_PENDING',
          version: period.version + 1,
          updatedAt: now(),
        },
        { transaction },
      );
      await this.writeEvent(transaction, companyId, row.id, 'attendance.rectification.requested', {
        periodId,
        recordId,
      });
      return row;
    });
  }

  async decideCorrection(
    companyId: number,
    actorUserId: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const correction = await AttendanceEntityModel.findOne({
        where: { id, companyId, type: { [Op.in]: ['CORRECTION', 'RECTIFICATION'] } },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!correction) throw new NotFoundError('Attendance correction');
      if (correction.status !== 'PENDING')
        throw new ConflictError('Correction has already been decided.');
      const policy = await this.getPolicy(companyId, transaction);
      if (policy.separationOfDuties && correction.createdBy === actorUserId) {
        throw new ForbiddenError('A user cannot approve their own attendance correction.');
      }
      let replacementId: string | null = null;
      if (decision === 'APPROVED') {
        const original = await AttendanceRecordModel.findOne({
          where: { id: correction.parentId!, companyId },
          transaction,
        });
        if (!original) throw new NotFoundError('Original attendance punch');
        const requestedAt = new Date(String(correction.data.requestedOccurredAt));
        if (Number.isNaN(requestedAt.getTime()))
          throw new ValidationError('Invalid corrected punch timestamp.');
        const company = await CompanyModel.findByPk(companyId, {
          attributes: ['timezone'],
          transaction,
        });
        if (!company) throw new NotFoundError('Company');
        const correctedWorkDate = localDate(requestedAt, company.timezone);
        if (correction.type === 'CORRECTION') {
          await this.assertOpenDay(companyId, original.employeeId, original.workDate, transaction);
          await this.assertOpenDay(companyId, original.employeeId, correctedWorkDate, transaction);
        } else {
          const period = await this.requireEntity(
            companyId,
            String(correction.data.periodId),
            'PERIOD',
            transaction,
          );
          if (correctedWorkDate < period.periodStart! || correctedWorkDate > period.periodEnd!) {
            throw new ValidationError(
              'A post-close rectification must remain within its attendance period.',
            );
          }
        }
        const correctionRecord = await AttendanceRecordModel.create(
          {
            id: randomUUID(),
            companyId,
            employeeId: original.employeeId,
            punchType: String(correction.data.requestedPunchType) as never,
            occurredAt: requestedAt,
            workDate: correctedWorkDate,
            timezone: company.timezone,
            source: 'CORRECTION',
            externalReference: null,
            idempotencyKey: null,
            deviceId: original.deviceId,
            correctionOfId: original.id,
            metadata: { reason: correction.data.reason, approvedBy: actorUserId },
            createdBy: actorUserId,
            createdAt: now(),
          },
          { transaction },
        );
        replacementId = correctionRecord.id;
        if (correction.type === 'CORRECTION') {
          await this.invalidateDay(companyId, original.employeeId, original.workDate, transaction);
          await this.invalidateDay(companyId, original.employeeId, correctedWorkDate, transaction);
        }
      }
      await correction.update(
        {
          status: decision,
          version: correction.version + 1,
          data: {
            ...correction.data,
            decisionReason: reason ?? null,
            decidedBy: actorUserId,
            decidedAt: now().toISOString(),
            replacementId,
          },
          updatedAt: now(),
        },
        { transaction },
      );
      if (correction.type === 'RECTIFICATION') {
        const periodId = String(correction.data.periodId);
        const period = await this.requireEntity(companyId, periodId, 'PERIOD', transaction, true);
        const pending = await AttendanceEntityModel.count({
          where: {
            companyId,
            type: 'RECTIFICATION',
            status: 'PENDING',
            workDate: { [Op.gte]: period.periodStart!, [Op.lte]: period.periodEnd! },
          },
          transaction,
        });
        if (!pending) {
          await period.update(
            { status: 'CLOSED', version: period.version + 1, updatedAt: now() },
            { transaction },
          );
        }
      }
      await this.writeEvent(
        transaction,
        companyId,
        correction.id,
        `attendance.${correction.type === 'RECTIFICATION' ? 'rectification' : 'correction'}.${decision.toLowerCase()}`,
        { replacementId },
      );
      return correction;
    });
  }

  async createPeriod(companyId: number, actorUserId: number, startDate: string, endDate: string) {
    assertDate(startDate);
    assertDate(endDate);
    if (startDate > endDate)
      throw new ValidationError('Period start date must be on or before its end date.');
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const overlap = await AttendanceEntityModel.findOne({
        where: {
          companyId,
          type: 'PERIOD',
          status: { [Op.ne]: 'CANCELLED' },
          periodStart: { [Op.lte]: endDate },
          periodEnd: { [Op.gte]: startDate },
        },
        transaction,
      });
      if (overlap) throw new ConflictError('Attendance periods cannot overlap.');
      const period = await AttendanceEntityModel.create(
        {
          id: randomUUID(),
          companyId,
          type: 'PERIOD',
          employeeId: null,
          parentId: null,
          workDate: null,
          periodStart: startDate,
          periodEnd: endDate,
          status: 'OPEN',
          version: 1,
          idempotencyKey: null,
          data: { openedAt: now().toISOString() },
          createdBy: actorUserId,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      await this.writeEvent(transaction, companyId, period.id, 'attendance.period.opened', {
        startDate,
        endDate,
      });
      return period;
    });
  }

  async closePeriod(companyId: number, actorUserId: number, periodId: string) {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const period = await this.requireEntity(companyId, periodId, 'PERIOD', transaction, true);
      if (period.status === 'CLOSED' || period.status === 'RECTIFICATION_PENDING') {
        const snapshot = await AttendanceEntityModel.findOne({
          where: { companyId, type: 'SNAPSHOT', parentId: period.id },
          transaction,
        });
        return { period, snapshot };
      }
      if (period.status !== 'READY_TO_CLOSE')
        throw new ConflictError('Validate the attendance period before closing it.');
      const range = { [Op.gte]: period.periodStart!, [Op.lte]: period.periodEnd! };
      const pending = await AttendanceEntityModel.count({
        where: {
          companyId,
          type: { [Op.in]: ['OCCURRENCE', 'JUSTIFICATION', 'CORRECTION'] },
          workDate: range,
          status: 'PENDING',
        },
        transaction,
      });
      const uncalculatedDays = await this.countUncalculatedDays(
        companyId,
        period.periodStart!,
        period.periodEnd!,
        transaction,
      );
      const staleDays = await this.countStaleDays(
        companyId,
        period.periodStart!,
        period.periodEnd!,
        transaction,
      );
      if (pending || uncalculatedDays || staleDays) {
        throw new ConflictError(
          `Cannot close period with ${pending} pending items, ${uncalculatedDays} uncalculated employee days and ${staleDays} stale calculations.`,
        );
      }
      const rows = await AttendanceEntityModel.findAll({
        where: { companyId, type: 'DAY', workDate: range },
        order: [
          ['workDate', 'ASC'],
          ['employeeId', 'ASC'],
        ],
        transaction,
      });
      const snapshotData = rows.map((row) => row.toJSON());
      const snapshot = await AttendanceEntityModel.create(
        {
          id: randomUUID(),
          companyId,
          type: 'SNAPSHOT',
          employeeId: null,
          parentId: period.id,
          workDate: null,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          status: 'IMMUTABLE',
          version: 1,
          idempotencyKey: null,
          data: {
            dayCount: rows.length,
            days: snapshotData,
            createdAt: now().toISOString(),
            createdBy: actorUserId,
          },
          createdBy: actorUserId,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      await period.update(
        {
          status: 'CLOSED',
          version: period.version + 1,
          data: { ...period.data, closedAt: now().toISOString(), snapshotId: snapshot.id },
          updatedAt: now(),
        },
        { transaction },
      );
      await this.writeEvent(transaction, companyId, period.id, 'attendance.period.closed', {
        snapshotId: snapshot.id,
        dayCount: rows.length,
      });
      return { period, snapshot };
    });
  }

  async validatePeriod(companyId: number, actorUserId: number, periodId: string) {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const period = await this.requireEntity(companyId, periodId, 'PERIOD', transaction, true);
      if (
        period.status !== 'OPEN' &&
        period.status !== 'UNDER_REVIEW' &&
        period.status !== 'READY_TO_CLOSE'
      ) {
        throw new ConflictError('Only open or reviewable attendance periods can be validated.');
      }
      const pendingByType: Record<string, number> = {};
      for (const type of ['OCCURRENCE', 'JUSTIFICATION', 'CORRECTION']) {
        pendingByType[type] = await AttendanceEntityModel.count({
          where: {
            companyId,
            type,
            status: 'PENDING',
            workDate: { [Op.gte]: period.periodStart!, [Op.lte]: period.periodEnd! },
          },
          transaction,
        });
      }
      const dayCount = await AttendanceEntityModel.count({
        where: {
          companyId,
          type: 'DAY',
          workDate: { [Op.gte]: period.periodStart!, [Op.lte]: period.periodEnd! },
        },
        transaction,
      });
      const uncalculatedDays = await this.countUncalculatedDays(
        companyId,
        period.periodStart!,
        period.periodEnd!,
        transaction,
      );
      const staleDays = await this.countStaleDays(
        companyId,
        period.periodStart!,
        period.periodEnd!,
        transaction,
      );
      const totalPending = Object.values(pendingByType).reduce((sum, count) => sum + count, 0);
      const status =
        totalPending || uncalculatedDays || staleDays ? 'UNDER_REVIEW' : 'READY_TO_CLOSE';
      await period.update(
        {
          status,
          version: period.version + 1,
          data: {
            ...period.data,
            validation: {
              pendingByType,
              uncalculatedDays,
              staleDays,
              dayCount,
              validatedAt: now().toISOString(),
              validatedBy: actorUserId,
            },
          },
          updatedAt: now(),
        },
        { transaction },
      );
      await this.writeEvent(transaction, companyId, period.id, 'attendance.period.validated', {
        status,
        pendingByType,
        uncalculatedDays,
        staleDays,
        dayCount,
      });
      return {
        period,
        pendingByType,
        uncalculatedDays,
        staleDays,
        dayCount,
        readyToClose: totalPending === 0 && uncalculatedDays === 0 && staleDays === 0,
      };
    });
  }

  async getPeriod(companyId: number, periodId: string) {
    return withTenant(companyId, (transaction) =>
      this.requireEntity(companyId, periodId, 'PERIOD', transaction),
    );
  }

  async listSnapshots(companyId: number, periodId: string) {
    return withTenant(companyId, async (transaction) => {
      await this.requireEntity(companyId, periodId, 'PERIOD', transaction);
      return AttendanceEntityModel.findAll({
        where: { companyId, type: 'SNAPSHOT', parentId: periodId },
        order: [['createdAt', 'DESC']],
        transaction,
      });
    });
  }

  async attendanceSummary(companyId: number, from: string, to: string) {
    assertDate(from);
    assertDate(to);
    if (from > to)
      throw new ValidationError('Report start date must be on or before its end date.');
    return withTenant(companyId, async (transaction) => {
      const days = await AttendanceEntityModel.findAll({
        where: { companyId, type: 'DAY', workDate: { [Op.gte]: from, [Op.lte]: to } },
        transaction,
      });
      const summary = {
        dayCount: days.length,
        workedMinutes: 0,
        expectedMinutes: 0,
        statuses: {} as Record<string, number>,
      };
      for (const day of days) {
        summary.workedMinutes += Number(day.data.workedMinutes ?? 0);
        summary.expectedMinutes += Number(day.data.expectedMinutes ?? 0);
        summary.statuses[day.status] = (summary.statuses[day.status] ?? 0) + 1;
      }
      return { from, to, ...summary };
    });
  }

  async listEntities(
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
  ) {
    const where: Record<string, unknown> = {
      companyId,
      type: Array.isArray(type) ? { [Op.in]: type } : type,
    };
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.status) where.status = query.status;
    if (query.from || query.to)
      where.workDate = {
        ...(query.from ? { [Op.gte]: query.from } : {}),
        ...(query.to ? { [Op.lte]: query.to } : {}),
      };
    return withTenant(companyId, async (transaction) => {
      const result = await AttendanceEntityModel.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        transaction,
      });
      return { data: result.rows, total: result.count, page: query.page, limit: query.limit };
    });
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
    if (
      !Number.isInteger(input.lateToleranceMinutes) ||
      input.lateToleranceMinutes < 0 ||
      !Number.isInteger(input.earlyDepartureToleranceMinutes) ||
      input.earlyDepartureToleranceMinutes < 0
    ) {
      throw new ValidationError('Attendance tolerances must be non-negative integer minutes.');
    }
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const previous = await AttendanceEntityModel.findOne({
        where: { companyId, type: 'POLICY' },
        order: [['version', 'DESC']],
        transaction,
      });
      const row = await AttendanceEntityModel.create(
        {
          id: randomUUID(),
          companyId,
          type: 'POLICY',
          employeeId: null,
          parentId: previous?.id ?? null,
          workDate: null,
          periodStart: null,
          periodEnd: null,
          status: 'ACTIVE',
          version: (previous?.version ?? 0) + 1,
          idempotencyKey: null,
          data: input,
          createdBy: actorUserId,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      await this.writeEvent(transaction, companyId, row.id, 'attendance.policy.changed', {
        version: row.version,
        ...input,
      });
      return row;
    });
  }

  async importPunches(
    companyId: number,
    actorUserId: number,
    rows: PunchInputDto[],
    batchKey: string,
  ) {
    if (!rows.length || rows.length > 5000)
      throw new ValidationError('Import must contain between 1 and 5000 punches.');
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      let batch = await AttendanceEntityModel.findOne({
        where: { companyId, type: 'IMPORT_BATCH', idempotencyKey: batchKey },
        transaction,
      });
      if (batch) {
        const items = await AttendanceEntityModel.findAll({
          where: { companyId, type: 'IMPORT_ITEM', parentId: batch.id },
          order: [['createdAt', 'ASC']],
          transaction,
        });
        return { batch, items };
      }
      batch = await AttendanceEntityModel.create(
        {
          id: randomUUID(),
          companyId,
          type: 'IMPORT_BATCH',
          employeeId: null,
          parentId: null,
          workDate: null,
          periodStart: null,
          periodEnd: null,
          status: 'PROCESSING',
          version: 1,
          idempotencyKey: batchKey,
          data: { totalRows: rows.length },
          createdBy: actorUserId,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      const items: AttendanceEntityModel[] = [];
      for (let index = 0; index < rows.length; index += 1) {
        const input = rows[index];
        try {
          const item = await sequelize.transaction({ transaction }, async (rowTransaction) => {
            const employee = await EmployeeModel.findOne({
              where: { id: input.employeeId, companyId },
              attributes: ['id'],
              transaction: rowTransaction,
            });
            if (!employee) throw new NotFoundError('Employee');
            const occurredAt = new Date(input.occurredAt);
            if (Number.isNaN(occurredAt.getTime()))
              throw new ValidationError('Invalid punch timestamp.');
            const company = await CompanyModel.findByPk(companyId, {
              attributes: ['timezone'],
              transaction: rowTransaction,
            });
            if (!company) throw new NotFoundError('Company');
            const timezone = company.timezone;
            const workDate = input.workDate ?? localDate(occurredAt, timezone);
            assertDate(workDate);
            await this.assertOpenDay(companyId, input.employeeId, workDate, rowTransaction);
            const punch = await AttendanceRecordModel.create(
              {
                id: randomUUID(),
                companyId,
                employeeId: input.employeeId,
                punchType: input.punchType as never,
                occurredAt,
                workDate,
                timezone,
                source: 'IMPORT',
                externalReference: input.externalReference ?? null,
                idempotencyKey: input.idempotencyKey ?? `${batchKey}:${index}`,
                deviceId: input.deviceId ?? null,
                correctionOfId: null,
                metadata: input.metadata ?? {},
                createdBy: actorUserId,
                createdAt: now(),
              },
              { transaction: rowTransaction },
            );
            await this.invalidateDay(companyId, input.employeeId, workDate, rowTransaction);
            return AttendanceEntityModel.create(
              {
                id: randomUUID(),
                companyId,
                type: 'IMPORT_ITEM',
                employeeId: input.employeeId,
                parentId: batch!.id,
                workDate,
                periodStart: null,
                periodEnd: null,
                status: 'IMPORTED',
                version: 1,
                idempotencyKey: null,
                data: { row: index + 1, punchId: punch.id },
                createdBy: actorUserId,
                createdAt: now(),
                updatedAt: now(),
              },
              { transaction: rowTransaction },
            );
          });
          items.push(item);
        } catch (error) {
          if (!(error instanceof AppError) && !(error instanceof UniqueConstraintError))
            throw error;
          const message = error instanceof Error ? error.message : 'Unknown import error';
          items.push(
            await AttendanceEntityModel.create(
              {
                id: randomUUID(),
                companyId,
                type: 'IMPORT_ITEM',
                employeeId: input.employeeId ?? null,
                parentId: batch.id,
                workDate: input.workDate ?? null,
                periodStart: null,
                periodEnd: null,
                status: 'ERROR',
                version: 1,
                idempotencyKey: null,
                data: { row: index + 1, error: message },
                createdBy: actorUserId,
                createdAt: now(),
                updatedAt: now(),
              },
              { transaction },
            ),
          );
        }
      }
      const errors = items.filter((item) => item.status === 'ERROR').length;
      await batch.update(
        {
          status: errors ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
          data: { totalRows: rows.length, importedRows: rows.length - errors, errorRows: errors },
          updatedAt: now(),
        },
        { transaction },
      );
      await this.writeEvent(transaction, companyId, batch.id, 'attendance.import.completed', {
        totalRows: rows.length,
        errorRows: errors,
      });
      return { batch, items };
    });
  }

  private async findExpectedShift(
    companyId: number,
    employeeId: string,
    workDate: string,
    transaction: Transaction,
  ): Promise<{ shift: ExpectedShift | null; scheduleId: string | null }> {
    const assignments = await OrganizationRecordModel.findAll({
      where: {
        companyId,
        type: 'SCHEDULE_ASSIGNMENT',
        status: 'ACTIVE',
        effectiveFrom: { [Op.lte]: workDate },
        [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: workDate } }],
      },
      order: [['effectiveFrom', 'DESC']],
      transaction,
    });
    let assignment = assignments.find(
      (row) => row.data.targetType === 'EMPLOYEE' && row.data.targetId === employeeId,
    );
    if (!assignment) {
      const department = await OrganizationRecordModel.findOne({
        where: {
          companyId,
          type: 'DEPARTMENT_ASSIGNMENT',
          status: 'ACTIVE',
          employeeId,
          effectiveFrom: { [Op.lte]: workDate },
          [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: workDate } }],
        },
        order: [['effectiveFrom', 'DESC']],
        transaction,
      });
      if (department?.relatedId) {
        assignment = assignments.find(
          (row) =>
            row.data.targetType === 'DEPARTMENT' && row.data.targetId === department.relatedId,
        );
      }
    }
    if (!assignment?.relatedId) return { shift: null, scheduleId: null };
    const schedule = await OrganizationRecordModel.findOne({
      where: { id: assignment.relatedId, companyId, type: 'WORK_SCHEDULE', status: 'ACTIVE' },
      transaction,
    });
    if (!schedule) return { shift: null, scheduleId: null };
    const company = await CompanyModel.findByPk(companyId, {
      attributes: ['timezone'],
      transaction,
    });
    if (!company) throw new NotFoundError('Company');
    const weekday = new Date(`${workDate}T00:00:00.000Z`).getUTCDay();
    const shifts = (schedule.data.shifts ?? []) as Array<{
      weekday: number;
      startTime: string;
      endTime: string;
      crossesMidnight?: boolean;
      breakMinutes?: number;
    }>;
    const shiftData = shifts.find((value) => value.weekday === weekday);
    if (!shiftData) return { shift: null, scheduleId: schedule.id };
    const endDate = shiftData.crossesMidnight
      ? new Date(Date.parse(`${workDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
      : workDate;
    return {
      scheduleId: schedule.id,
      shift: {
        startAt: zonedDateTime(workDate, shiftData.startTime, company.timezone),
        endAt: zonedDateTime(endDate, shiftData.endTime, company.timezone),
        breakMinutes: shiftData.breakMinutes ?? 0,
      },
    };
  }

  private async getPolicy(companyId: number, transaction: Transaction) {
    const row = await AttendanceEntityModel.findOne({
      where: { companyId, type: 'POLICY', status: 'ACTIVE' },
      order: [['version', 'DESC']],
      transaction,
    });
    return {
      version: row?.version ?? 1,
      lateToleranceMinutes: Number(row?.data.lateToleranceMinutes ?? 0),
      earlyDepartureToleranceMinutes: Number(row?.data.earlyDepartureToleranceMinutes ?? 0),
      separationOfDuties: Boolean(row?.data.separationOfDuties ?? true),
    };
  }

  private async assertEmployee(
    companyId: number,
    employeeId: string,
    transaction: Transaction,
  ): Promise<void> {
    const employee = await EmployeeModel.findOne({
      where: { id: employeeId, companyId },
      attributes: ['id'],
      transaction,
    });
    if (!employee) throw new NotFoundError('Employee');
  }

  private async countUncalculatedDays(
    companyId: number,
    startDate: string,
    endDate: string,
    transaction: Transaction,
  ): Promise<number> {
    const records = await AttendanceRecordModel.findAll({
      where: { companyId, workDate: { [Op.gte]: startDate, [Op.lte]: endDate } },
      attributes: ['employeeId', 'workDate'],
      transaction,
    });
    const days = await AttendanceEntityModel.findAll({
      where: {
        companyId,
        type: 'DAY',
        workDate: { [Op.gte]: startDate, [Op.lte]: endDate },
      },
      attributes: ['employeeId', 'workDate'],
      transaction,
    });
    const calculated = new Set(days.map((day) => `${day.employeeId}:${dateOnly(day.workDate!)}`));
    const uncalculated = new Set(
      records
        .map((record) => `${record.employeeId}:${dateOnly(record.workDate)}`)
        .filter((key) => !calculated.has(key)),
    );
    return uncalculated.size;
  }

  private async countStaleDays(
    companyId: number,
    startDate: string,
    endDate: string,
    transaction: Transaction,
  ): Promise<number> {
    return AttendanceEntityModel.count({
      where: {
        companyId,
        type: 'DAY',
        status: 'STALE',
        workDate: { [Op.gte]: startDate, [Op.lte]: endDate },
      },
      transaction,
    });
  }

  private async invalidateDay(
    companyId: number,
    employeeId: string,
    workDate: string,
    transaction: Transaction,
  ): Promise<void> {
    const day = await AttendanceEntityModel.findOne({
      where: { companyId, type: 'DAY', employeeId, workDate },
      transaction,
    });
    if (!day) return;
    await day.update(
      {
        status: 'STALE',
        version: day.version + 1,
        data: { ...day.data, recalculationNeeded: true, staleSince: now().toISOString() },
        updatedAt: now(),
      },
      { transaction },
    );
  }

  private async assertOpenDay(
    companyId: number,
    employeeId: string,
    workDate: string,
    transaction: Transaction,
  ): Promise<void> {
    const closed = await AttendanceEntityModel.findOne({
      where: {
        companyId,
        type: 'PERIOD',
        status: { [Op.in]: ['CLOSED', 'RECTIFICATION_PENDING'] },
        periodStart: { [Op.lte]: workDate },
        periodEnd: { [Op.gte]: workDate },
      },
      transaction,
    });
    if (closed) throw new ConflictError('Attendance records in a closed period cannot be changed.');
    await this.assertEmployee(companyId, employeeId, transaction);
  }

  private async requireEntity(
    companyId: number,
    id: string,
    type: AttendanceEntityType,
    transaction: Transaction,
    lock = false,
  ): Promise<Entity> {
    const row = await AttendanceEntityModel.findOne({
      where: { id, companyId, type },
      transaction,
      ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!row) throw new NotFoundError(type.toLowerCase());
    return row;
  }

  private async lockCompany(companyId: number, transaction: Transaction): Promise<void> {
    const company = await CompanyModel.findByPk(companyId, {
      attributes: ['id'],
      transaction,
      ...(sequelize.getDialect() === 'sqlite' ? {} : { lock: transaction.LOCK.UPDATE }),
    });
    if (!company) throw new NotFoundError('Company');
  }

  private async writeEvent(
    transaction: Transaction,
    companyId: number,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await AttendanceOutboxModel.create(
      { companyId, aggregateId, eventType, payload, occurredAt: now(), publishedAt: null },
      { transaction },
    );
  }
}
