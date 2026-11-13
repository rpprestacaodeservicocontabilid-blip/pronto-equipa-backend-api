import { randomUUID } from 'crypto';
import { payrollPdf, payrollXlsx } from '../../infrastructure/payroll-export';
import { reservePayrollLoanDeductions } from '../../infrastructure/adapters/payroll-loans.adapter';
import { Op, Transaction } from 'sequelize';
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
import { PayrollRepository } from '../../infrastructure/payroll.repository';
import {
  PayrollEmployeeResultModel as Result,
  PayrollInputSnapshotModel as Input,
  PayrollOutboxModel as Outbox,
  PayrollRunModel as Run,
} from '../../infrastructure/payroll.models';
import {
  PayrollAdjustment,
  PayrollApproval,
  PayrollBatch,
  PayrollCalculation,
  PayrollClosing,
  PayrollInstruction,
  PayrollIssue,
  PayrollItem,
  PayrollLine,
  PayrollPolicy,
  PayrollExport,
  WorkflowModel,
} from '../../infrastructure/payroll-workflow.models';

export class PayrollWorkflowService extends PayrollRepository {
  constructor(
    private readonly sources: PayrollSourceReaderPort,
    private readonly calculator: PayrollCalculatorPort,
  ) {
    super();
  }
  private async locked(
    companyId: number,
    id: string,
    transaction: Transaction,
    expectedVersion?: number,
  ) {
    const run = await Run.findOne({
      where: { companyId, id },
      transaction,
      lock: transaction.LOCK.UPDATE,
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
    return this.transaction(companyId, async transaction => {
      const key = `validation:${runId}:${expectedVersion}`;
      const existing = await PayrollBatch.findOne({ where: { companyId, key }, transaction });
      if (existing) return existing;
      const run = await this.locked(companyId, runId, transaction, expectedVersion);
      if (!['DRAFT', 'VALIDATION_FAILED'].includes(run.status)) throw new ConflictError('Execution cannot start validation.');
      await run.update({ status: 'VALIDATING', version: run.version + 1 }, { transaction });
      return PayrollBatch.create(this.record(companyId, runId, key, { jobType: 'VALIDATION', actorUserId: actor, expectedVersion: run.version }, 'PENDING'), { transaction });
    });
  }
  async processValidation(companyId: number, batchId: string) {
    const claimed = await this.transaction(companyId, async transaction => {
      const batch = await PayrollBatch.findOne({ where: { companyId, id: batchId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!batch || batch.status === 'COMPLETED' || (batch.status === 'PROCESSING' && Number(batch.data.leaseUntil) > Date.now())) return null;
      const run = await this.locked(companyId, batch.runId!, transaction);
      if (run.status !== 'VALIDATING' || run.version !== Number(batch.data.expectedVersion)) {
        await batch.update({ status: 'COMPLETED' }, { transaction });
        return null;
      }
      await batch.update({ status: 'PROCESSING', data: { ...batch.data, leaseUntil: Date.now() + 600000 } }, { transaction });
      return batch;
    });
    if (!claimed) return;
    await this.validate(companyId, Number(claimed.data.actorUserId), claimed.runId!, Number(claimed.data.expectedVersion));
    await this.transaction(companyId, async transaction => { await PayrollBatch.update({ status: 'COMPLETED' }, { where: { companyId, id: batchId }, transaction }); });
  }
  async validate(companyId: number, actor: number, runId: string, expectedVersion: number) {
    const run = (await this.get(companyId, 'runs', runId)) as Run;
    const period = await this.get(companyId, 'periods', run.periodId);
    let calculationPeriod = period;
    if (run.get('originalRunId') && ['CORRECTION', 'RETROACTIVE'].includes(run.runType)) {
      const originalRun = await this.get(companyId, 'runs', String(run.get('originalRunId'))) as Run;
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
          calculationPeriod.get('startDate') as string,
          calculationPeriod.get('endDate') as string,
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
        source.data = { ...source.data, runType: run.runType, executionScope: run.executionScope, postingPeriod: { startDate: period.get('startDate'), endDate: period.get('endDate') } };
        const originalRunId = run.get('originalRunId') as string | null;
        if (originalRunId) {
          const original = (await this.query(companyId, originalRunId, 'results')) as Result[];
          const result = original.find((row) => row.get('employeeId') === employeeId);
          if (!result) throw new ConflictError('Original result missing.');
          source.data = {
            ...source.data,
            originalResult: result.toJSON(),
            regularizationReason: run.get('reason'),
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
      await PayrollIssue.destroy({ where: { companyId, runId }, transaction });
      for (const issue of issues)
        await PayrollIssue.create(
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
          const existing = await Input.findOne({
            where: { companyId, runId, employeeId: snapshot.employeeId },
            transaction,
          });
          if (existing && existing.get('inputHash') !== snapshot.inputHash)
            throw new ConflictError('Validated inputs are immutable; create a new execution.');
          if (!existing)
            await Input.create(
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
      await current.update(
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
      if (await PayrollIssue.count({ where: { companyId, runId, status: 'OPEN' }, transaction }))
        throw new ConflictError('Blocking validation issues exist.');
      const snapshots = await Input.findAll({ where: { companyId, runId }, transaction });
      if (snapshots.length !== run.employeeIds.length)
        throw new ConflictError('Missing validated snapshots.');
      for (let offset = 0; offset < snapshots.length; offset += 100) {
        const batchKey = `${runId}:batch:${offset / 100}`;
        if (!(await PayrollBatch.findOne({ where: { companyId, key: batchKey }, transaction })))
          await PayrollBatch.create(
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
          const employeeId = snapshot.get('employeeId') as string;
          const key = `${runId}:${employeeId}`;
          const item = await PayrollItem.findOne({ where: { companyId, key }, transaction });
          if (!item)
            await PayrollItem.create(
              this.record(
                companyId,
                runId,
                key,
                { snapshotId: snapshot.get('id'), batchKey, attempts: 0, actorUserId: actor },
                'PENDING',
                employeeId,
              ),
              { transaction },
            );
          else if (retry && item.status === 'FAILED')
            await item.update({ status: 'PENDING', version: item.version + 1 }, { transaction });
        }
      }
      await run.update({ status: 'PROCESSING', version: run.version + 1 }, { transaction });
      await this.event(companyId, runId, 'payroll.run.processing-started', actor, transaction);
      return run;
    });
  }
  async processItem(companyId: number, itemId: string): Promise<void> {
    const claimed = await this.transaction(companyId, async (transaction) => {
      const item = await PayrollItem.findOne({
        where: { companyId, id: itemId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!item || item.status === 'COMPLETED' || item.status === 'FAILED') return null;
      const run = await this.locked(companyId, item.runId!, transaction);
      if (run.status !== 'PROCESSING') return null;
      const concurrent = await PayrollItem.findAll({ where: { companyId, status: 'PROCESSING' }, transaction });
      const limit = Math.max(1, Math.min(8, Number(process.env.PAYROLL_TENANT_CONCURRENCY) || 2));
      if (concurrent.filter(other => other.id !== item.id && Number(other.data.leaseUntil) > Date.now()).length >= limit) return null;
      if (item.status === 'PROCESSING' && Number(item.data.leaseUntil) > Date.now()) return null;
      const snapshot = await Input.findOne({
        where: { companyId, id: item.data.snapshotId, runId: run.id, employeeId: item.employeeId },
        transaction,
      });
      if (!snapshot) throw new ConflictError('Input snapshot missing.');
      const token = randomUUID();
      await item.update(
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
        snapshot: snapshot.get('snapshotData') as PayrollInputSnapshot,
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
      const item = await PayrollItem.findOne({
        where: { companyId, id: itemId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!item || item.data.token !== claimed.token || run.status !== 'PROCESSING') return;
      if (!errorCode && result) {
        try { await reservePayrollLoanDeductions(companyId, run.id, claimed.snapshot, result, transaction, run.runType === 'SIMULATION'); }
        catch (error) { if (error instanceof AppError) errorCode = 'LOAN_DEDUCTION_UNAVAILABLE'; else throw error; }
      }
      if (!errorCode && result) {
        const saved = await Result.create(
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
        await PayrollCalculation.create(
          this.record(
            companyId,
            run.id,
            `${run.id}:${item.employeeId}`,
            {
              resultId: saved.get('id'),
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
          await PayrollLine.create(
            this.record(
              companyId,
              run.id,
              `${saved.get('id')}:${index}`,
              { resultId: saved.get('id'), ...line },
              'COMPLETED',
              item.employeeId,
            ),
            { transaction },
          );
        if (run.get('originalRunId')) {
          const original = await Result.findOne({
            where: { companyId, runId: run.get('originalRunId'), employeeId: item.employeeId },
            transaction,
          });
          if (!original || original.get('currency') !== result.currency)
            throw new ConflictError('Original result currency mismatch.');
          await PayrollAdjustment.create(
            this.record(
              companyId,
              run.id,
              `${run.id}:${item.employeeId}`,
              {
                originalResultId: original.get('id'),
                resultId: saved.get('id'),
                reason: run.get('reason'),
                netDifference: money(
                  cents(result.netAmount) - cents(String(original.get('netAmount'))),
                ),
                grossDifference: money(
                  cents(result.grossAmount) - cents(String(original.get('grossAmount'))),
                ),
              },
              'CALCULATED',
              item.employeeId,
            ),
            { transaction },
          );
        }
      }
      await item.update(
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
      const items = await PayrollItem.findAll({ where: { companyId, runId: run.id }, transaction });
      for (const batch of await PayrollBatch.findAll({
        where: { companyId, runId: run.id },
        transaction,
      })) {
        const members = items.filter((member) => member.data.batchKey === batch.key);
        await batch.update(
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
        await run.update(
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
  private async results(companyId: number, runId: string, transaction: Transaction) {
    return Result.findAll({
      where: { companyId, runId },
      order: [['employeeId', 'ASC']],
      transaction,
    });
  }
  private totals(results: Result[]) {
    const currencies = new Set(results.map((result) => result.get('currency')));
    if (currencies.size !== 1) throw new ConflictError('Results must have a single currency.');
    const sum = (field: string) =>
      money(results.reduce((total, row) => total + cents(String(row.get(field))), 0n));
    return {
      grossAmount: sum('grossAmount'),
      deductionsAmount: sum('deductionsAmount'),
      netAmount: sum('netAmount'),
      employerCostsAmount: sum('employerCostsAmount'),
      currency: results[0].get('currency'),
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
        (await PayrollIssue.count({ where: { companyId, runId, status: 'OPEN' }, transaction })) ||
        (await PayrollItem.count({
          where: { companyId, runId, status: { [Op.ne]: 'COMPLETED' } },
          transaction,
        }))
      )
        throw new ConflictError('Incomplete execution or blocking issues.');
      const totals = this.totals(results);
      for (const result of results) {
        const calculation = validateCalculation(result.get('calculationSnapshot'));
        for (const field of [
          'grossAmount',
          'deductionsAmount',
          'netAmount',
          'employerCostsAmount',
        ] as const)
          if (cents(String(result.get(field))) !== cents(calculation[field]))
            throw new ConflictError('Stored monetary totals differ from calculation evidence.');
        const snapshot = await Input.findOne({
          where: { companyId, runId, employeeId: result.get('employeeId') },
          transaction,
        });
        const evidence = result.get('calculationSnapshot') as Record<string, unknown>;
        if (
          !snapshot ||
          evidence.inputHash !== snapshot.get('inputHash') ||
          evidence.inputSnapshotId !== snapshot.get('id')
        )
          throw new ConflictError('Input evidence does not match result.');
      }
      const submitter = await PayrollApproval.findOne({
        where: { companyId, runId, status: 'SUBMITTED' },
        transaction,
      });
      if (
        ['approve', 'reject'].includes(action) &&
        (Number(run.get('createdBy')) === actor || Number(submitter?.data.actorUserId) === actor)
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
          ? await PayrollPolicy.findOne({
              where: { companyId, status: 'ACTIVE' },
              order: [['createdAt', 'DESC']],
              transaction,
            })
          : null;
      if (action === 'approve') {
        const approvals = await PayrollApproval.findAll({
          where: { companyId, runId, status: 'APPROVED' },
          transaction,
        });
        if (approvals.some((approval) => Number(approval.data.actorUserId) === actor))
          throw new ConflictError('This user has already approved the execution.');
        const required = Number(submitter?.data.requiredApprovals ?? 1);
        if (approvals.length + 1 < required) target = 'SUBMITTED';
      }
      if (action === 'close') {
        const approvals = await PayrollApproval.findAll({
          where: { companyId, runId, status: 'APPROVED' },
          transaction,
        });
        if (!approvals.length) throw new ConflictError('Approval evidence missing.');
        const data = {
          run: run.toJSON(),
          results: results.map((result) => result.toJSON()),
          totals,
          approvals: approvals.map((approval) => approval.toJSON()),
          closedBy: actor,
          closedAt: new Date().toISOString(),
        };
        await PayrollClosing.create(
          this.record(companyId, runId, runId, { ...data, closingHash: hash(data) }, 'CLOSED'),
          { transaction },
        );
      } else
        await PayrollApproval.create(
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
      await run.update({ status: target, version: run.version + 1 }, { transaction });
      await this.event(
        companyId,
        runId,
        action === 'approve' && target === 'SUBMITTED'
          ? 'payroll.run.approval-recorded'
          : `payroll.run.${states[action].toLowerCase()}`,
        actor,
        transaction,
        { runId, runVersion: run.version, totals, ...(action === 'close' ? { results: results.map(result => ({ id: result.get('id'), employeeId: result.get('employeeId'), currency: result.get('currency'), netAmount: result.get('netAmount'), calculationSnapshot: result.get('calculationSnapshot') })) } : {}) },
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
        const key = String(result.get('id'));
        const adjustment = await PayrollAdjustment.findOne({
          where: { companyId, runId, employeeId: String(result.get('employeeId')) },
          transaction,
        });
        const amount = String(adjustment?.data.netDifference ?? result.get('netAmount'));
        if (amount.startsWith('-'))
          throw new ConflictError(
            'Negative regularization requires recovery authorization; automatic payment preparation is blocked.',
          );
        if (!(await PayrollInstruction.findOne({ where: { companyId, key }, transaction })))
          await PayrollInstruction.create(
            this.record(
              companyId,
              runId,
              key,
              {
                resultId: key,
                amount,
                currency: result.get('currency'),
                reference: `payroll-${key}`,
              },
              'PREPARED',
              result.get('employeeId') as string,
            ),
            { transaction },
          );
      }
      if (
        !(await Outbox.findOne({
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
          { instructions: (await PayrollInstruction.findAll({ where: { companyId, runId }, transaction })).map(instruction => instruction.toJSON()) },
        );
      return PayrollInstruction.findAll({ where: { companyId, runId }, transaction });
    });
  }
  policy(companyId: number, actor: number, input?: { code: string; requiredApprovals: number }) {
    return this.transaction(companyId, async (transaction) => {
      if (!input)
        return PayrollPolicy.findAll({
          where: { companyId },
          order: [['createdAt', 'DESC']],
          transaction,
        });
      const previous = await PayrollPolicy.findOne({
        where: { companyId, status: 'ACTIVE' },
        transaction,
      });
      if (previous) await previous.update({ status: 'SUPERSEDED' }, { transaction });
      const record = await PayrollPolicy.create(
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
      const existing = await PayrollExport.findOne({ where: { companyId, key }, transaction });
      if (existing) {
        if (
          existing.runId !== runId ||
          existing.data.format !== format ||
          existing.data.actorUserId !== actor
        )
          throw new ConflictError('Export idempotency key mismatch.');
        return { id: existing.id, status: existing.status };
      }
      const record = await PayrollExport.create(
        this.record(companyId, runId, key, { format, actorUserId: actor }, 'PENDING'),
        { transaction },
      );
      return { id: record.id, status: record.status };
    });
  }
  async buildExport(companyId: number, exportId: string) {
    return this.transaction(companyId, async (transaction) => {
      const record = await PayrollExport.findOne({
        where: { companyId, id: exportId },
        transaction,
        lock: transaction.LOCK.UPDATE,
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
          ].map((field) => String(result.get(field))),
        ),
      ];
      const buffer = record.data.format === 'PDF' ? payrollPdf(rows) : payrollXlsx(rows);
      await record.update(
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
      const record = await PayrollExport.findOne({
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
      const original = previous.find((row) => row.get('employeeId') === result.get('employeeId'));
      if (original && original.get('currency') !== result.get('currency'))
        throw new ConflictError('Cannot compare different currencies.');
      return {
        employeeId: result.get('employeeId'),
        currency: result.get('currency'),
        netDifference: money(
          cents(String(result.get('netAmount'))) -
            (original ? cents(String(original.get('netAmount'))) : 0n),
        ),
      };
    });
  }
  report(companyId: number, periodId: string, type: string) {
    return this.transaction(companyId, async (transaction) => {
      const runs = await Run.findAll({
        where: { companyId, periodId, status: 'CLOSED' },
        transaction,
      });
      const data = [];
      for (const run of runs) {
        const results = await this.results(companyId, run.id, transaction);
        if (type === 'summary')
          data.push({ runId: run.id, runType: run.runType, ...this.totals(results) });
        else {
          const lines = await PayrollLine.findAll({
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
        const items = await PayrollItem.findAll({ where: { companyId, runId }, transaction });
        return {
          status: run.status,
          version: run.version,
          totalItems: run.employeeIds.length,
          completedItems: items.filter((item) => item.status === 'COMPLETED').length,
          failedItems: items.filter((item) => item.status === 'FAILED').length,
        };
      }
      const models: Record<string, typeof PayrollIssue> = {
        issues: PayrollIssue,
        closing: PayrollClosing,
        'payment-instructions': PayrollInstruction,
        history: PayrollApproval,
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
        const result = results.find((row) => row.get('id') === resultId);
        if (!result) throw new NotFoundError('Payroll result');
        return resource === 'explanation' ? result.get('calculationSnapshot') : result;
      }
      return results;
    });
  }
}
