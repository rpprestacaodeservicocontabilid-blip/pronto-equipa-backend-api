import { PayrollLifecycleService } from './payroll-lifecycle.service';
import {
  PayrollLoanReservationPort,
  PayrollExportRendererPort,
} from '../ports/payroll-persistence.port';
import {
  PayrollPersistencePort,
  PayrollResultRecord as Result,
} from '../ports/payroll-persistence.port';
import {
  RecordStoreContext,
  RecordFilter as Op,
} from '../../../../shared/application/ports/record-store.port';

import { randomUUID } from 'crypto';

import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../../shared/errors/app.error';
import { PayrollCalculatorPort, PayrollInputSnapshot } from '../ports/payroll-calculator.port';
import { PayrollSourceReaderPort } from '../ports/payroll-integrations.port';
import { cents, hash, money, validateCalculation } from '../../domain/payroll-result';

export class PayrollWorkflowService extends PayrollLifecycleService {
  constructor(
    private readonly sources: PayrollSourceReaderPort,
    private readonly calculator: PayrollCalculatorPort,
    persistence: PayrollPersistencePort,
    private readonly loans: PayrollLoanReservationPort,
    private readonly renderer: PayrollExportRendererPort,
  ) {
    super(persistence);
  }
  private async locked(
    companyId: number,
    id: string,
    transaction: RecordStoreContext,
    expectedVersion?: number,
  ) {
    const run = await this.persistence.runs.findOne({
      where: { companyId, id },
      transaction,
      forUpdate: true,
    });
    if (!run) throw new NotFoundError('Payroll execution');
    if (expectedVersion !== undefined && run.version !== expectedVersion)
      throw new ConflictError('Stale execution version.');
    return run;
  }
  private record(
    companyId: number,
    runId: string | null,
    key: string,
    data: Record<string, unknown>,
    status = 'ACTIVE',
    employeeId: string | null = null,
  ) {
    return { id: randomUUID(), companyId, runId, employeeId, key, status, version: 1, data };
  }
  queueValidation(companyId: number, actor: number, runId: string, expectedVersion: number) {
    return this.transaction(companyId, async (transaction) => {
      const key = `validation:${runId}:${expectedVersion}`;
      const existing = await this.persistence.collections.payrollBatch.findOne({
        where: { companyId, key },
        transaction,
      });
      if (existing) return existing;
      const run = await this.locked(companyId, runId, transaction, expectedVersion);
      if (!['DRAFT', 'VALIDATION_FAILED'].includes(run.status))
        throw new ConflictError('Execution cannot start validation.');
      await this.persistence.runs.update(
        run,
        { status: 'VALIDATING', version: run.version + 1 },
        { transaction },
      );
      return this.persistence.collections.payrollBatch.create(
        this.record(
          companyId,
          runId,
          key,
          { jobType: 'VALIDATION', actorUserId: actor, expectedVersion: run.version },
          'PENDING',
        ),
        { transaction },
      );
    });
  }
  async processValidation(companyId: number, batchId: string) {
    const claimed = await this.transaction(companyId, async (transaction) => {
      const batch = await this.persistence.collections.payrollBatch.findOne({
        where: { companyId, id: batchId },
        transaction,
        forUpdate: true,
      });
      if (
        !batch ||
        batch.status === 'COMPLETED' ||
        (batch.status === 'PROCESSING' && Number(batch.data.leaseUntil) > Date.now())
      )
        return null;
      const run = await this.locked(companyId, batch.runId!, transaction);
      if (run.status !== 'VALIDATING' || run.version !== Number(batch.data.expectedVersion)) {
        await this.persistence.update(batch, { status: 'COMPLETED' }, { transaction });
        return null;
      }
      await this.persistence.update(
        batch,
        { status: 'PROCESSING', data: { ...batch.data, leaseUntil: Date.now() + 600000 } },
        { transaction },
      );
      return batch;
    });
    if (!claimed) return;
    await this.validate(
      companyId,
      Number(claimed.data.actorUserId),
      claimed.runId!,
      Number(claimed.data.expectedVersion),
    );
    await this.transaction(companyId, async (transaction) => {
      await this.persistence.collections.payrollBatch.updateWhere(
        { status: 'COMPLETED' },
        { where: { companyId, id: batchId }, transaction },
      );
    });
  }
  async validate(companyId: number, actor: number, runId: string, expectedVersion: number) {
    const run = await this.get(companyId, 'runs', runId);
    const period = await this.get(companyId, 'periods', run.periodId);
    let calculationPeriod = period;
    if (run.originalRunId && ['CORRECTION', 'RETROACTIVE'].includes(run.runType)) {
      const originalRun = await this.get(companyId, 'runs', String(run.originalRunId));
      calculationPeriod = await this.get(companyId, 'periods', originalRun.periodId);
    }
    if (!['DRAFT', 'VALIDATION_FAILED', 'VALIDATING'].includes(run.status))
      throw new ConflictError('Execution cannot be validated in this state.');
    // Sources are read outside the financial transaction. Commit verifies the version.
    const snapshots: PayrollInputSnapshot[] = [];
    const issues: Array<{ employeeId: string; message: string }> = [];
    for (const employeeId of run.employeeIds) {
      try {
        const source = await this.sources.read(
          companyId,
          runId,
          employeeId,
          calculationPeriod.startDate,
          calculationPeriod.endDate,
        );
        if (
          source.companyId !== companyId ||
          source.payrollRunId !== runId ||
          source.employeeId !== employeeId ||
          !source.legalRuleSetVersion ||
          !source.salarySnapshotId ||
          !source.contractSnapshotId
        )
          throw new ValidationError('Incomplete or incompatible source snapshot.');
        source.data = {
          ...source.data,
          runType: run.runType,
          executionScope: run.executionScope,
          postingPeriod: { startDate: period.startDate, endDate: period.endDate },
        };
        const { originalRunId } = run;
        if (originalRunId) {
          const original = (await this.query(companyId, originalRunId, 'results')) as Result[];
          const result = original.find((row) => row.employeeId === employeeId);
          if (!result) throw new ConflictError('Original result missing.');
          source.data = {
            ...source.data,
            originalResult: result,
            regularizationReason: run.reason,
            runType: run.runType,
          };
        }
        snapshots.push({ ...source, inputSnapshotId: randomUUID(), inputHash: hash(source) });
      } catch (error) {
        issues.push({
          employeeId,
          message:
            error instanceof AppError
              ? error.message
              : 'Source data unavailable. Retry validation after correcting the integration.',
        });
      }
    }
    return this.transaction(companyId, async (transaction) => {
      const current = await this.locked(companyId, runId, transaction, expectedVersion);
      if (!['DRAFT', 'VALIDATION_FAILED', 'VALIDATING'].includes(current.status))
        throw new ConflictError('Execution changed while validating.');
      await this.persistence.collections.payrollIssue.destroy({
        where: { companyId, runId },
        transaction,
      });
      for (const issue of issues)
        await this.persistence.collections.payrollIssue.create(
          this.record(
            companyId,
            runId,
            `${runId}:${issue.employeeId}`,
            { severity: 'BLOCKING', code: 'INVALID_SOURCE', message: issue.message },
            'OPEN',
            issue.employeeId,
          ),
          { transaction },
        );
      if (!issues.length) {
        for (const snapshot of snapshots) {
          const existing = await this.persistence.inputs.findOne({
            where: { companyId, runId, employeeId: snapshot.employeeId },
            transaction,
          });
          if (existing && existing.inputHash !== snapshot.inputHash)
            throw new ConflictError('Validated inputs are immutable; create a new execution.');
          if (!existing)
            await this.persistence.inputs.create(
              {
                id: snapshot.inputSnapshotId,
                companyId,
                runId,
                employeeId: snapshot.employeeId,
                inputHash: snapshot.inputHash,
                snapshotData: snapshot,
              },
              { transaction },
            );
        }
      }
      await this.persistence.runs.update(
        current,
        {
          status: issues.length ? 'VALIDATION_FAILED' : 'VALIDATING',
          version: current.version + 1,
        },
        { transaction },
      );
      await this.event(companyId, runId, 'payroll.run.validation-completed', actor, transaction);
      return { run: current, issues };
    });
  }
  async start(
    companyId: number,
    actor: number,
    runId: string,
    expectedVersion: number,
    retry = false,
  ) {
    return this.transaction(companyId, async (transaction) => {
      const run = await this.locked(companyId, runId, transaction, expectedVersion);
      if (!(retry ? ['FAILED', 'PARTIALLY_PROCESSED'] : ['VALIDATING']).includes(run.status))
        throw new ConflictError('Execution is not ready for processing.');
      if (
        await this.persistence.collections.payrollIssue.count({
          where: { companyId, runId, status: 'OPEN' },
          transaction,
        })
      )
        throw new ConflictError('Blocking validation issues exist.');
      const snapshots = await this.persistence.inputs.findAll({
        where: { companyId, runId },
        transaction,
      });
      if (snapshots.length !== run.employeeIds.length)
        throw new ConflictError('Missing validated snapshots.');
      for (let offset = 0; offset < snapshots.length; offset += 100) {
        const batchKey = `${runId}:batch:${offset / 100}`;
        if (
          !(await this.persistence.collections.payrollBatch.findOne({
            where: { companyId, key: batchKey },
            transaction,
          }))
        )
          await this.persistence.collections.payrollBatch.create(
            this.record(
              companyId,
              runId,
              batchKey,
              { totalItems: Math.min(100, snapshots.length - offset) },
              'PENDING',
            ),
            { transaction },
          );
        for (const snapshot of snapshots.slice(offset, offset + 100)) {
          const { employeeId } = snapshot;
          const key = `${runId}:${employeeId}`;
          const item = await this.persistence.collections.payrollItem.findOne({
            where: { companyId, key },
            transaction,
          });
          if (!item)
            await this.persistence.collections.payrollItem.create(
              this.record(
                companyId,
                runId,
                key,
                { snapshotId: snapshot.id, batchKey, attempts: 0, actorUserId: actor },
                'PENDING',
                employeeId,
              ),
              { transaction },
            );
          else if (retry && item.status === 'FAILED')
            await this.persistence.update(
              item,
              { status: 'PENDING', version: item.version + 1 },
              { transaction },
            );
        }
      }
      await this.persistence.runs.update(
        run,
        { status: 'PROCESSING', version: run.version + 1 },
        { transaction },
      );
      await this.event(companyId, runId, 'payroll.run.processing-started', actor, transaction);
      return run;
    });
  }
  async processItem(companyId: number, itemId: string): Promise<void> {
    const claimed = await this.transaction(companyId, async (transaction) => {
      const item = await this.persistence.collections.payrollItem.findOne({
        where: { companyId, id: itemId },
        transaction,
        forUpdate: true,
      });
      if (!item || item.status === 'COMPLETED' || item.status === 'FAILED') return null;
      const run = await this.locked(companyId, item.runId!, transaction);
      if (run.status !== 'PROCESSING') return null;
      const concurrent = await this.persistence.collections.payrollItem.findAll({
        where: { companyId, status: 'PROCESSING' },
        transaction,
      });
      const limit = Math.max(1, Math.min(8, Number(process.env.PAYROLL_TENANT_CONCURRENCY) || 2));
      if (
        concurrent.filter(
          (other) => other.id !== item.id && Number(other.data.leaseUntil) > Date.now(),
        ).length >= limit
      )
        return null;
      if (item.status === 'PROCESSING' && Number(item.data.leaseUntil) > Date.now()) return null;
      const snapshot = await this.persistence.inputs.findOne({
        where: { companyId, id: item.data.snapshotId, runId: run.id, employeeId: item.employeeId },
        transaction,
      });
      if (!snapshot) throw new ConflictError('Input snapshot missing.');
      const token = randomUUID();
      await this.persistence.update(
        item,
        {
          status: 'PROCESSING',
          data: {
            ...item.data,
            token,
            leaseUntil: Date.now() + 120000,
            attempts: Number(item.data.attempts) + 1,
          },
        },
        { transaction },
      );
      return {
        itemId,
        runId: run.id,
        token,
        snapshot: snapshot.snapshotData as PayrollInputSnapshot,
      };
    });
    if (!claimed) return;
    let result: ReturnType<typeof validateCalculation> | undefined;
    let errorCode: string | undefined;
    try {
      const { inputSnapshotId: _id, inputHash: _hash, ...source } = claimed.snapshot;
      if (hash(source) !== claimed.snapshot.inputHash)
        throw new ConflictError('Snapshot integrity check failed.');
      result = validateCalculation(await this.calculator.calculate(claimed.snapshot));
      if (
        result.employeeId !== claimed.snapshot.employeeId ||
        result.legalRuleSetVersion !== claimed.snapshot.legalRuleSetVersion
      )
        throw new ConflictError('Engine returned incompatible calculation identity.');
    } catch {
      errorCode = 'CALCULATION_FAILED';
    }
    await this.transaction(companyId, async (transaction) => {
      const run = await this.locked(companyId, claimed.runId, transaction);
      const item = await this.persistence.collections.payrollItem.findOne({
        where: { companyId, id: itemId },
        transaction,
        forUpdate: true,
      });
      if (!item || item.data.token !== claimed.token || run.status !== 'PROCESSING') return;
      if (!errorCode && result) {
        try {
          await this.loans.reserve(
            companyId,
            run.id,
            claimed.snapshot,
            result,
            transaction,
            run.runType === 'SIMULATION',
          );
        } catch (error) {
          if (error instanceof AppError) errorCode = 'LOAN_DEDUCTION_UNAVAILABLE';
          else throw error;
        }
      }
      if (!errorCode && result) {
        const saved = await this.persistence.results.create(
          {
            id: randomUUID(),
            companyId,
            runId: run.id,
            ...result,
            calculationSnapshot: {
              ...result,
              inputSnapshotId: claimed.snapshot.inputSnapshotId,
              inputHash: claimed.snapshot.inputHash,
            },
          },
          { transaction },
        );
        await this.persistence.collections.payrollCalculation.create(
          this.record(
            companyId,
            run.id,
            `${run.id}:${item.employeeId}`,
            {
              resultId: saved.id,
              ...result,
              inputSnapshotId: claimed.snapshot.inputSnapshotId,
              inputHash: claimed.snapshot.inputHash,
            },
            'COMPLETED',
            item.employeeId,
          ),
          { transaction },
        );
        for (const [index, line] of result.lines.entries())
          await this.persistence.collections.payrollLine.create(
            this.record(
              companyId,
              run.id,
              `${saved.id}:${index}`,
              { resultId: saved.id, ...line },
              'COMPLETED',
              item.employeeId,
            ),
            { transaction },
          );
        if (run.originalRunId) {
          const original = await this.persistence.results.findOne({
            where: { companyId, runId: run.originalRunId, employeeId: item.employeeId },
            transaction,
          });
          if (!original || original.currency !== result.currency)
            throw new ConflictError('Original result currency mismatch.');
          await this.persistence.collections.payrollAdjustment.create(
            this.record(
              companyId,
              run.id,
              `${run.id}:${item.employeeId}`,
              {
                originalResultId: original.id,
                resultId: saved.id,
                reason: run.reason,
                netDifference: money(cents(result.netAmount) - cents(String(original.netAmount))),
                grossDifference: money(
                  cents(result.grossAmount) - cents(String(original.grossAmount)),
                ),
              },
              'CALCULATED',
              item.employeeId,
            ),
            { transaction },
          );
        }
      }
      await this.persistence.update(
        item,
        {
          status: errorCode ? 'FAILED' : 'COMPLETED',
          data: { ...item.data, errorCode: errorCode ?? null },
        },
        { transaction },
      );
      await this.event(
        companyId,
        run.id,
        errorCode ? 'payroll.employee.failed' : 'payroll.employee.calculated',
        Number(item.data.actorUserId),
        transaction,
        { employeeId: item.employeeId, itemId: item.id, errorCode: errorCode ?? null },
      );
      const items = await this.persistence.collections.payrollItem.findAll({
        where: { companyId, runId: run.id },
        transaction,
      });
      for (const batch of await this.persistence.collections.payrollBatch.findAll({
        where: { companyId, runId: run.id },
        transaction,
      })) {
        const members = items.filter((member) => member.data.batchKey === batch.key);
        await this.persistence.update(
          batch,
          {
            status: members.every((member) => ['COMPLETED', 'FAILED'].includes(member.status))
              ? 'COMPLETED'
              : 'PROCESSING',
            data: {
              ...batch.data,
              completedItems: members.filter((member) => member.status === 'COMPLETED').length,
              failedItems: members.filter((member) => member.status === 'FAILED').length,
            },
          },
          { transaction },
        );
      }
      if (items.every((member) => ['COMPLETED', 'FAILED'].includes(member.status))) {
        const failed = items.filter((member) => member.status === 'FAILED').length;
        await this.persistence.runs.update(
          run,
          {
            status: failed
              ? failed === items.length
                ? 'FAILED'
                : 'PARTIALLY_PROCESSED'
              : 'READY_FOR_REVIEW',
            version: run.version + 1,
          },
          { transaction },
        );
        await this.event(
          companyId,
          run.id,
          failed ? 'payroll.run.processing-failed' : 'payroll.run.processing-completed',
          Number(item.data.actorUserId),
          transaction,
        );
      }
    });
  }
  private async results(companyId: number, runId: string, transaction: RecordStoreContext) {
    return this.persistence.results.findAll({
      where: { companyId, runId },
      order: [['employeeId', 'ASC']],
      transaction,
    });
  }
  private totals(results: Result[]) {
    const currencies = new Set(results.map((result) => result.currency));
    if (currencies.size !== 1) throw new ConflictError('Results must have a single currency.');
    const sum = (field: string) =>
      money(results.reduce((total, row) => total + cents(String(row[field])), 0n));
    return {
      grossAmount: sum('grossAmount'),
      deductionsAmount: sum('deductionsAmount'),
      netAmount: sum('netAmount'),
      employerCostsAmount: sum('employerCostsAmount'),
      currency: results[0].currency,
      employees: results.length,
    };
  }
  async transition(
    companyId: number,
    actor: number,
    runId: string,
    version: number,
    action: 'submit' | 'approve' | 'reject' | 'close',
    reason?: string,
  ) {
    return this.transaction(companyId, async (transaction) => {
      const run = await this.locked(companyId, runId, transaction);
      if (action === 'close' && run.status === 'CLOSED') return run;
      if (run.version !== version) throw new ConflictError('Stale execution version.');
      const expected = {
        submit: 'READY_FOR_REVIEW',
        approve: 'SUBMITTED',
        reject: 'SUBMITTED',
        close: 'APPROVED',
      };
      if (run.status !== expected[action]) throw new ConflictError('Invalid execution transition.');
      if (run.runType === 'SIMULATION' && action !== 'submit')
        throw new ConflictError('Simulations cannot be financially approved or closed.');
      if (action === 'reject' && !reason?.trim())
        throw new ValidationError('Rejection reason required.');
      const results = await this.results(companyId, runId, transaction);
      if (
        results.length !== run.employeeIds.length ||
        (await this.persistence.collections.payrollIssue.count({
          where: { companyId, runId, status: 'OPEN' },
          transaction,
        })) ||
        (await this.persistence.collections.payrollItem.count({
          where: { companyId, runId, status: { [Op.ne]: 'COMPLETED' } },
          transaction,
        }))
      )
        throw new ConflictError('Incomplete execution or blocking issues.');
      const totals = this.totals(results);
      for (const result of results) {
        const calculation = validateCalculation(result.calculationSnapshot);
        for (const field of [
          'grossAmount',
          'deductionsAmount',
          'netAmount',
          'employerCostsAmount',
        ] as const)
          if (cents(String(result[field])) !== cents(calculation[field]))
            throw new ConflictError('Stored monetary totals differ from calculation evidence.');
        const snapshot = await this.persistence.inputs.findOne({
          where: { companyId, runId, employeeId: result.employeeId },
          transaction,
        });
        const evidence = result.calculationSnapshot as Record<string, unknown>;
        if (
          !snapshot ||
          evidence.inputHash !== snapshot.inputHash ||
          evidence.inputSnapshotId !== snapshot.id
        )
          throw new ConflictError('Input evidence does not match result.');
      }
      const submitter = await this.persistence.collections.payrollApproval.findOne({
        where: { companyId, runId, status: 'SUBMITTED' },
        transaction,
      });
      if (
        ['approve', 'reject'].includes(action) &&
        (Number(run.createdBy) === actor || Number(submitter?.data.actorUserId) === actor)
      )
        throw new ForbiddenError('Approval requires a different operator.');
      const states = {
        submit: 'SUBMITTED',
        approve: 'APPROVED',
        reject: 'REJECTED',
        close: 'CLOSED',
      } as const;
      let target: typeof run.status = states[action];
      const activePolicy =
        action === 'submit'
          ? await this.persistence.collections.payrollPolicy.findOne({
              where: { companyId, status: 'ACTIVE' },
              order: [['createdAt', 'DESC']],
              transaction,
            })
          : null;
      if (action === 'approve') {
        const approvals = await this.persistence.collections.payrollApproval.findAll({
          where: { companyId, runId, status: 'APPROVED' },
          transaction,
        });
        if (approvals.some((approval) => Number(approval.data.actorUserId) === actor))
          throw new ConflictError('This user has already approved the execution.');
        const required = Number(submitter?.data.requiredApprovals ?? 1);
        if (approvals.length + 1 < required) target = 'SUBMITTED';
      }
      if (action === 'close') {
        const approvals = await this.persistence.collections.payrollApproval.findAll({
          where: { companyId, runId, status: 'APPROVED' },
          transaction,
        });
        if (!approvals.length) throw new ConflictError('Approval evidence missing.');
        const data = {
          run,
          results: results.map((result) => result),
          totals,
          approvals: approvals.map((approval) => approval),
          closedBy: actor,
          closedAt: new Date().toISOString(),
        };
        await this.persistence.collections.payrollClosing.create(
          this.record(companyId, runId, runId, { ...data, closingHash: hash(data) }, 'CLOSED'),
          { transaction },
        );
      } else
        await this.persistence.collections.payrollApproval.create(
          this.record(
            companyId,
            runId,
            `${runId}:${action}:${run.version}`,
            {
              actorUserId: actor,
              reason: reason ?? null,
              runVersion: run.version,
              ...(action === 'submit'
                ? {
                    policyId: activePolicy?.id ?? null,
                    requiredApprovals: activePolicy?.data.requiredApprovals ?? 1,
                  }
                : {}),
            },
            states[action],
          ),
          { transaction },
        );
      await this.persistence.runs.update(
        run,
        { status: target, version: run.version + 1 },
        { transaction },
      );
      await this.event(
        companyId,
        runId,
        action === 'approve' && target === 'SUBMITTED'
          ? 'payroll.run.approval-recorded'
          : `payroll.run.${states[action].toLowerCase()}`,
        actor,
        transaction,
        {
          runId,
          runVersion: run.version,
          totals,
          ...(action === 'close'
            ? {
                results: results.map((result) => ({
                  id: result.id,
                  employeeId: result.employeeId,
                  currency: result.currency,
                  netAmount: result.netAmount,
                  calculationSnapshot: result.calculationSnapshot,
                })),
              }
            : {}),
        },
      );
      return run;
    });
  }
  async preparePayments(companyId: number, actor: number, runId: string, version: number) {
    return this.transaction(companyId, async (transaction) => {
      const run = await this.locked(companyId, runId, transaction, version);
      if (run.status !== 'CLOSED' || run.runType === 'SIMULATION')
        throw new ConflictError('Only closed financial executions can prepare payments.');
      for (const result of await this.results(companyId, runId, transaction)) {
        const key = String(result.id);
        const adjustment = await this.persistence.collections.payrollAdjustment.findOne({
          where: { companyId, runId, employeeId: String(result.employeeId) },
          transaction,
        });
        const amount = String(adjustment?.data.netDifference ?? result.netAmount);
        if (amount.startsWith('-'))
          throw new ConflictError(
            'Negative regularization requires recovery authorization; automatic payment preparation is blocked.',
          );
        if (
          !(await this.persistence.collections.payrollInstruction.findOne({
            where: { companyId, key },
            transaction,
          }))
        )
          await this.persistence.collections.payrollInstruction.create(
            this.record(
              companyId,
              runId,
              key,
              {
                resultId: key,
                amount,
                currency: result.currency,
                reference: `payroll-${key}`,
              },
              'PREPARED',
              result.employeeId,
            ),
            { transaction },
          );
      }
      if (
        !(await this.persistence.outbox.findOne({
          where: {
            companyId,
            aggregateId: runId,
            eventType: 'payroll.payment-instructions.prepared',
          },
          transaction,
        }))
      )
        await this.event(
          companyId,
          runId,
          'payroll.payment-instructions.prepared',
          actor,
          transaction,
          {
            instructions: (
              await this.persistence.collections.payrollInstruction.findAll({
                where: { companyId, runId },
                transaction,
              })
            ).map((instruction) => instruction),
          },
        );
      return this.persistence.collections.payrollInstruction.findAll({
        where: { companyId, runId },
        transaction,
      });
    });
  }
  policy(companyId: number, actor: number, input?: { code: string; requiredApprovals: number }) {
    return this.transaction(companyId, async (transaction) => {
      if (!input)
        return this.persistence.collections.payrollPolicy.findAll({
          where: { companyId },
          order: [['createdAt', 'DESC']],
          transaction,
        });
      const previous = await this.persistence.collections.payrollPolicy.findOne({
        where: { companyId, status: 'ACTIVE' },
        transaction,
      });
      if (previous)
        await this.persistence.update(previous, { status: 'SUPERSEDED' }, { transaction });
      const record = await this.persistence.collections.payrollPolicy.create(
        this.record(companyId, null, randomUUID(), { ...input, actorUserId: actor }, 'ACTIVE'),
        { transaction },
      );
      await this.event(companyId, record.id, 'payroll.policy.created', actor, transaction);
      return record;
    });
  }
  requestExport(
    companyId: number,
    actor: number,
    runId: string,
    format: 'PDF' | 'XLSX',
    idempotencyKey: string,
  ) {
    return this.transaction(companyId, async (transaction) => {
      await this.locked(companyId, runId, transaction);
      const key = `export:${idempotencyKey}`;
      const existing = await this.persistence.collections.payrollExport.findOne({
        where: { companyId, key },
        transaction,
      });
      if (existing) {
        if (
          existing.runId !== runId ||
          existing.data.format !== format ||
          existing.data.actorUserId !== actor
        )
          throw new ConflictError('Export idempotency key mismatch.');
        return { id: existing.id, status: existing.status };
      }
      const record = await this.persistence.collections.payrollExport.create(
        this.record(companyId, runId, key, { format, actorUserId: actor }, 'PENDING'),
        { transaction },
      );
      return { id: record.id, status: record.status };
    });
  }
  async buildExport(companyId: number, exportId: string) {
    return this.transaction(companyId, async (transaction) => {
      const record = await this.persistence.collections.payrollExport.findOne({
        where: { companyId, id: exportId },
        transaction,
        forUpdate: true,
      });
      if (!record || record.status !== 'PENDING') return;
      const results = await this.results(companyId, record.runId!, transaction);
      const rows = [
        ['Employee', 'Currency', 'Gross', 'Deductions', 'Net', 'Employer costs'],
        ...results.map((result) =>
          [
            'employeeId',
            'currency',
            'grossAmount',
            'deductionsAmount',
            'netAmount',
            'employerCostsAmount',
          ].map((field) => String(result[field])),
        ),
      ];
      const buffer =
        record.data.format === 'PDF' ? this.renderer.pdf(rows) : this.renderer.xlsx(rows);
      await this.persistence.update(
        record,
        {
          status: 'COMPLETED',
          data: {
            ...record.data,
            content: buffer.toString('base64'),
            expiresAt: Date.now() + 86400000,
          },
        },
        { transaction },
      );
    });
  }
  downloadExport(companyId: number, exportId: string) {
    return this.transaction(companyId, async (transaction) => {
      const record = await this.persistence.collections.payrollExport.findOne({
        where: { companyId, id: exportId },
        transaction,
      });
      if (!record) throw new NotFoundError('Payroll export');
      if (record.status !== 'COMPLETED' || Number(record.data.expiresAt) < Date.now())
        throw new ConflictError('Export is pending or expired.');
      return {
        buffer: Buffer.from(String(record.data.content), 'base64'),
        format: record.data.format,
      };
    });
  }
  async comparison(companyId: number, runId: string, otherRunId: string) {
    const current = (await this.query(companyId, runId, 'results')) as Result[];
    const previous = (await this.query(companyId, otherRunId, 'results')) as Result[];
    return current.map((result) => {
      const original = previous.find((row) => row.employeeId === result.employeeId);
      if (original && original.currency !== result.currency)
        throw new ConflictError('Cannot compare different currencies.');
      return {
        employeeId: result.employeeId,
        currency: result.currency,
        netDifference: money(
          cents(String(result.netAmount)) - (original ? cents(String(original.netAmount)) : 0n),
        ),
      };
    });
  }
  report(companyId: number, periodId: string, type: string) {
    return this.transaction(companyId, async (transaction) => {
      const runs = await this.persistence.runs.findAll({
        where: { companyId, periodId, status: 'CLOSED' },
        transaction,
      });
      const data = [];
      for (const run of runs) {
        const results = await this.results(companyId, run.id, transaction);
        if (type === 'summary')
          data.push({ runId: run.id, runType: run.runType, ...this.totals(results) });
        else {
          const lines = await this.persistence.collections.payrollLine.findAll({
            where: { companyId, runId: run.id },
            transaction,
          });
          data.push(
            ...lines
              .filter(
                (line) =>
                  line.data.type === (type === 'deductions' ? 'DEDUCTION' : 'EMPLOYER_COST'),
              )
              .map((line) => ({ runId: run.id, employeeId: line.employeeId, ...line.data })),
          );
        }
      }
      return data;
    });
  }
  async query(companyId: number, runId: string, resource: string, resultId?: string) {
    return this.transaction(companyId, async (transaction) => {
      const run = await this.locked(companyId, runId, transaction);
      if (resource === 'progress') {
        const items = await this.persistence.collections.payrollItem.findAll({
          where: { companyId, runId },
          transaction,
        });
        return {
          status: run.status,
          version: run.version,
          totalItems: run.employeeIds.length,
          completedItems: items.filter((item) => item.status === 'COMPLETED').length,
          failedItems: items.filter((item) => item.status === 'FAILED').length,
        };
      }
      const models: Record<string, typeof this.persistence.collections.payrollIssue> = {
        issues: this.persistence.collections.payrollIssue,
        closing: this.persistence.collections.payrollClosing,
        'payment-instructions': this.persistence.collections.payrollInstruction,
        history: this.persistence.collections.payrollApproval,
      };
      if (models[resource])
        return models[resource].findAll({
          where: { companyId, runId },
          order: [['createdAt', 'ASC']],
          transaction,
        });
      const results = await this.results(companyId, runId, transaction);
      if (resource === 'summary') return results.length ? this.totals(results) : { employees: 0 };
      if (resultId) {
        const result = results.find((row) => row.id === resultId);
        if (!result) throw new NotFoundError('Payroll result');
        return resource === 'explanation' ? result.calculationSnapshot : result;
      }
      return results;
    });
  }
}
