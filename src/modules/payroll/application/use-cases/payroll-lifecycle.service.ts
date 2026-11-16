import {
  PayrollPeriodRecord,
  PayrollRunRecord,
  PayrollPersistencePort,
} from '../ports/payroll-persistence.port';
import {
  RecordStoreContext,
  RecordFilter as Op,
} from '../../../../shared/application/ports/record-store.port';
import { PersistenceConflictError } from '../../../../shared/application/ports/persistence-conflict.error';
import { createHash, randomUUID } from 'crypto';

import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/errors/app.error';

import { PayrollPeriod, PayrollRun, RunType } from '../../domain/payroll';

export interface CreateRunInput {
  periodId: string;
  runType: RunType;
  executionScope: 'INDIVIDUAL' | 'COLLECTIVE';
  employeeIds: string[];
  idempotencyKey: string;
  originalRunId?: string;
  reason?: string;
}

export class PayrollLifecycleService {
  constructor(protected readonly persistence: PayrollPersistencePort) {}
  protected transaction<T>(
    companyId: number,
    operation: (context: RecordStoreContext) => Promise<T>,
  ): Promise<T> {
    return this.persistence.runs.transaction(companyId, operation);
  }
  protected async event(
    companyId: number,
    aggregateId: string,
    eventType: string,
    actorUserId: number,
    transaction: RecordStoreContext,
    payload: Record<string, unknown> = {},
  ) {
    await this.persistence.outbox.create(
      {
        id: randomUUID(),
        companyId,
        aggregateId,
        eventType,
        payload: { ...payload, eventVersion: 1, actorUserId, companyId, aggregateId },
        publishedAt: null,
      },
      { transaction },
    );
  }
  updatePeriod(
    companyId: number,
    actorUserId: number,
    id: string,
    expectedVersion: number,
    input: { startDate: string; endDate: string; paymentDate: string },
  ) {
    PayrollPeriod.validate(input.startDate, input.endDate, input.paymentDate);
    return this.transaction(companyId, async (transaction) => {
      const period = await this.persistence.periods.findOne({
        where: { companyId, id },
        transaction,
        forUpdate: true,
      });
      if (!period) throw new NotFoundError('Payroll period');
      if (period.status !== 'DRAFT' || period.version !== expectedVersion)
        throw new ConflictError('Only the current draft period can be updated.');
      if (
        await this.persistence.periods.count({
          where: {
            companyId,
            id: { [Op.ne]: id },
            startDate: { [Op.lte]: input.endDate },
            endDate: { [Op.gte]: input.startDate },
          },
          transaction,
        })
      )
        throw new ConflictError('Payroll periods cannot overlap.');
      await this.persistence.periods.update(
        period,
        { ...input, version: expectedVersion + 1 },
        { transaction },
      );
      await this.event(companyId, id, 'payroll.period.updated', actorUserId, transaction);
      return period;
    });
  }
  list(companyId: number, entity: 'periods' | 'runs', page: number, limit: number) {
    return this.transaction(companyId, async (transaction) => {
      const model = entity === 'periods' ? this.persistence.periods : this.persistence.runs;
      const result = await model.findAll({
        where: { companyId },
        transaction,
        order: [
          ['createdAt', 'DESC'],
          ['id', 'ASC'],
        ],
        limit,
        offset: (page - 1) * limit,
      });
      return {
        data: result,
        total: Number(await model.count({ where: { companyId }, transaction })),
        page,
        limit,
      };
    });
  }
  get(companyId: number, entity: 'periods', id: string): Promise<PayrollPeriodRecord>;
  get(companyId: number, entity: 'runs', id: string): Promise<PayrollRunRecord>;
  get(
    companyId: number,
    entity: 'periods' | 'runs',
    id: string,
  ): Promise<PayrollPeriodRecord | PayrollRunRecord>;
  get(companyId: number, entity: 'periods' | 'runs', id: string) {
    return this.transaction(companyId, async (transaction) => {
      const model = entity === 'periods' ? this.persistence.periods : this.persistence.runs;
      const record = await model.findOne({ where: { companyId, id }, transaction });
      if (!record) throw new NotFoundError('Payroll record');
      return record;
    });
  }
  createPeriod(
    companyId: number,
    actorUserId: number,
    input: { startDate: string; endDate: string; paymentDate: string },
  ) {
    PayrollPeriod.validate(input.startDate, input.endDate, input.paymentDate);
    return this.transaction(companyId, async (transaction) => {
      const overlap = await this.persistence.periods.findOne({
        where: {
          companyId,
          startDate: { [Op.lte]: input.endDate },
          endDate: { [Op.gte]: input.startDate },
        },
        transaction,
      });
      if (overlap) throw new ConflictError('Payroll periods cannot overlap.');
      const period = await this.persistence.periods.create(
        {
          id: randomUUID(),
          companyId,
          ...input,
          status: 'DRAFT',
          version: 1,
          createdBy: actorUserId,
        },
        { transaction },
      );
      await this.event(companyId, period.id, 'payroll.period.created', actorUserId, transaction);
      return period;
    });
  }
  changePeriod(
    companyId: number,
    actorUserId: number,
    id: string,
    version: number,
    action: 'open' | 'close',
  ) {
    return this.transaction(companyId, async (transaction) => {
      const period = await this.persistence.periods.findOne({
        where: { companyId, id },
        transaction,
        forUpdate: true,
      });
      if (!period) throw new NotFoundError('Payroll period');
      if (period.version !== version) throw new ConflictError('Stale period version.');
      if (period.status !== (action === 'open' ? 'DRAFT' : 'OPEN'))
        throw new ConflictError('Invalid period transition.');
      if (action === 'close') {
        const runs = await this.persistence.runs.findAll({
          where: { companyId, periodId: id },
          transaction,
        });
        if (
          !runs.some((run) => run.status === 'CLOSED') ||
          runs.some((run) => !['CLOSED', 'CANCELLED'].includes(run.status))
        )
          throw new ConflictError('Close all payroll executions before closing the period.');
      }
      await this.persistence.periods.update(
        period,
        { status: action === 'open' ? 'OPEN' : 'CLOSED', version: version + 1 },
        { transaction },
      );
      await this.event(
        companyId,
        id,
        `payroll.period.${action === 'open' ? 'opened' : 'closed'}`,
        actorUserId,
        transaction,
      );
      return period;
    });
  }
  createRun(companyId: number, actorUserId: number, input: CreateRunInput) {
    PayrollRun.scope(input.executionScope, input.employeeIds);
    const normalized = {
      periodId: input.periodId,
      runType: input.runType,
      executionScope: input.executionScope,
      employeeIds: [...input.employeeIds].sort(),
      originalRunId: input.originalRunId ?? null,
      reason: input.reason ?? null,
    };
    const requestHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    return this.transaction(companyId, async (transaction) => {
      const existing = await this.persistence.runs.findOne({
        where: { companyId, idempotencyKey: input.idempotencyKey },
        transaction,
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictError('Idempotency key already used for different input.');
        return existing;
      }
      const period = await this.persistence.periods.findOne({
        where: { companyId, id: input.periodId },
        transaction,
        forUpdate: true,
      });
      if (!period) throw new NotFoundError('Payroll period');
      if (period.status !== 'OPEN') throw new ConflictError('Payroll period must be open.');
      if (['CORRECTION', 'RETROACTIVE', 'SUPPLEMENTARY'].includes(input.runType)) {
        const original = input.originalRunId
          ? await this.persistence.runs.findOne({
              where: { companyId, id: input.originalRunId, status: 'CLOSED' },
              transaction,
            })
          : null;
        if (
          !original ||
          !input.reason?.trim() ||
          input.employeeIds.some((id) => !original.employeeIds.includes(id))
        )
          throw new ValidationError(
            'A closed original execution, its employees and a reason are required.',
          );
        const existingAdjustments = await this.persistence.runs.findAll({
          where: {
            companyId,
            originalRunId: input.originalRunId,
            status: { [Op.ne]: 'CANCELLED' },
          },
          transaction,
        });
        if (
          existingAdjustments.some((run) =>
            run.employeeIds.some((id) => input.employeeIds.includes(id)),
          )
        )
          throw new ConflictError(
            'An adjustment already exists for this original employee result; correct the latest closed adjustment instead.',
          );
      } else if (input.originalRunId)
        throw new ValidationError('Original execution only applies to regularizations.');
      const employees = await this.persistence.employeeCount({
        where: { companyId, id: { [Op.in]: input.employeeIds } },
        transaction,
      });
      if (employees !== input.employeeIds.length)
        throw new ValidationError('All selected employees must belong to this company.');
      if (input.runType === 'REGULAR') {
        const others = await this.persistence.runs.findAll({
          where: {
            companyId,
            periodId: input.periodId,
            runType: 'REGULAR',
            status: { [Op.ne]: 'CANCELLED' },
          },
          transaction,
        });
        if (others.some((run) => run.employeeIds.some((id) => input.employeeIds.includes(id))))
          throw new ConflictError(
            'An employee already belongs to a regular execution for this period.',
          );
      }
      const run = await this.persistence.runs.create(
        {
          id: randomUUID(),
          companyId,
          ...normalized,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          status: 'DRAFT',
          version: 1,
          createdBy: actorUserId,
        },
        { transaction },
      );
      await this.event(companyId, run.id, 'payroll.run.created', actorUserId, transaction);
      return run;
    }).catch((error) => {
      if (error instanceof PersistenceConflictError)
        throw new ConflictError('Concurrent execution creation; retry the same key.');
      throw error;
    });
  }
  cancel(companyId: number, actorUserId: number, id: string, version: number) {
    return this.transaction(companyId, async (transaction) => {
      const run = await this.persistence.runs.findOne({
        where: { companyId, id },
        transaction,
        forUpdate: true,
      });
      if (!run) throw new NotFoundError('Payroll execution');
      if (run.version !== version) throw new ConflictError('Stale execution version.');
      await this.persistence.runs.update(
        run,
        { status: PayrollRun.cancel(run.status), version: version + 1 },
        { transaction },
      );
      await this.persistence.releaseLoans(
        { payrollRunId: null },
        { where: { companyId, payrollRunId: id, status: 'REQUESTED' }, transaction },
      );
      await this.event(companyId, id, 'payroll.run.cancelled', actorUserId, transaction);
      return run;
    });
  }
}
