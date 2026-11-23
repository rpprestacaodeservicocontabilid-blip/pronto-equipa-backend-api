import { SequelizePayrollPersistence } from '../../modules/payroll/infrastructure/persistence/repositories/sequelize-payroll-persistence';
import { resolveRecordTransaction } from '../../shared/infrastructure/persistence/sequelize-record-store';
import { reservePayrollLoanDeductions } from '../../modules/payroll/infrastructure/adapters/payroll-loans.adapter';
import { payrollPdf, payrollXlsx } from '../../modules/payroll/infrastructure/payroll-export';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { ENV } from '../../config/env';
import { sequelize } from '../../infra/database';
import { resetTestDatabase } from '../support/database';
import { CompanyModel } from '../../modules/tenancy/infrastructure/persistence/models/company.model';
import { EmployeeModel } from '../../modules/employees/infrastructure/persistence/models/employee.model';
import { PayrollWorkflowService } from '../../modules/payroll/application/use-cases/payroll-workflow.service';
import { PayrollCalculatorPort } from '../../modules/payroll/application/ports/payroll-calculator.port';
import { PayrollSourceReaderPort } from '../../modules/payroll/application/ports/payroll-integrations.port';
import {
  PayrollItem,
  PayrollClosing,
  PayrollInstruction,
} from '../../modules/payroll/infrastructure/persistence/models/payroll-workflow.models';
import {
  PayrollEmployeeResultModel,
  PayrollInputSnapshotModel,
  PayrollOutboxModel,
  PayrollRunModel,
} from '../../modules/payroll/infrastructure/persistence/models/payroll.models';
import { createPayrollModule } from '../../modules/payroll/payroll.module';

jest.setTimeout(90000);
describe('Payroll workflow with deterministic integration fixtures', () => {
  let companyId: number, foreignId: number, employeeId: string;
  let service: PayrollWorkflowService;
  let fail = false;
  const sources: PayrollSourceReaderPort = {
    read: async (companyId, payrollRunId, employeeId, startDate, endDate) => ({
      companyId,
      payrollRunId,
      employeeId,
      period: { startDate, endDate },
      salarySnapshotId: 'salary-v1',
      contractSnapshotId: 'contract-v1',
      legalRuleSetVersion: 'fixture-legal-v1',
      data: { currency: 'AOA', recordedAt: new Date('2026-01-01T08:00:00Z') },
    }),
  };
  const calculator: PayrollCalculatorPort = {
    calculate: async (input) => {
      if (fail) throw new Error('Integration unavailable');
      return {
        employeeId: input.employeeId,
        grossAmount: '100.00',
        deductionsAmount: '10.00',
        netAmount: '90.00',
        employerCostsAmount: '5.00',
        currency: 'AOA',
        engineVersion: 'fixture-v1',
        legalRuleSetVersion: input.legalRuleSetVersion,
        calculationTraceId: 'trace-1',
        lines: [
          { code: 'BASE', type: 'EARNING', amount: '100.00', sourceReference: 'contract-v1' },
          {
            code: 'DEDUCTION',
            type: 'DEDUCTION',
            amount: '10.00',
            sourceReference: 'fixture-legal-v1',
          },
          {
            code: 'EMPLOYER',
            type: 'EMPLOYER_COST',
            amount: '5.00',
            sourceReference: 'fixture-legal-v1',
          },
        ],
      };
    },
  };
  beforeAll(async () => {
    if (ENV.NODE_ENV !== 'test' || sequelize.getDialect() !== 'sqlite')
      throw new Error('Tests require isolated SQLite test configuration');
    await resetTestDatabase();
    companyId = (
      await CompanyModel.create({
        name: 'Payroll',
        slug: 'payroll-test',
        status: 'ACTIVE',
        timezone: 'Africa/Luanda',
        locale: 'pt-AO',
      })
    ).id;
    foreignId = (
      await CompanyModel.create({
        name: 'Foreign',
        slug: 'foreign-payroll-test',
        status: 'ACTIVE',
        timezone: 'Africa/Luanda',
        locale: 'pt-AO',
      })
    ).id;
    employeeId = randomUUID();
    await EmployeeModel.create({
      id: employeeId,
      companyId,
      employeeNumber: 'PAY-001',
      firstName: 'Ana',
      lastName: 'Manuel',
      dateOfBirth: null,
      nationality: null,
      email: null,
      phone: null,
      admissionDate: new Date('2026-01-01'),
      departmentId: null,
      jobTitle: null,
      jobCategory: null,
      status: 'ACTIVE',
      terminationDate: null,
      terminationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    service = new PayrollWorkflowService(
      sources,
      calculator,
      new SequelizePayrollPersistence(),
      {
        reserve: (companyId, runId, snapshot, result, context, simulation) =>
          reservePayrollLoanDeductions(
            companyId,
            runId,
            snapshot,
            result,
            resolveRecordTransaction(context)!,
            simulation,
          ),
      },
      { pdf: payrollPdf, xlsx: payrollXlsx },
    );
  });
  async function draft(month: string) {
    const period = await service.createPeriod(companyId, 10, {
      startDate: `2026-${month}-01`,
      endDate: `2026-${month}-28`,
      paymentDate: `2026-${month}-28`,
    });
    await service.changePeriod(companyId, 10, period.id, 1, 'open');
    return service.createRun(companyId, 10, {
      periodId: period.id,
      runType: 'REGULAR',
      executionScope: 'INDIVIDUAL',
      employeeIds: [employeeId],
      idempotencyKey: `month-${month}`,
    });
  }
  async function process(run: { id: string; version: number }) {
    await service.validate(companyId, 10, run.id, 1);
    await service.start(companyId, 10, run.id, 2);
    const item = await PayrollItem.findOne({ where: { companyId, runId: run.id } });
    await service.processItem(companyId, item!.id);
    return item!;
  }
  test('idempotent create, duplicate regular execution and tenant isolation', async () => {
    const run = await draft('01');
    const input = {
      periodId: run.periodId,
      runType: 'REGULAR' as const,
      executionScope: 'INDIVIDUAL' as const,
      employeeIds: [employeeId],
      idempotencyKey: 'month-01',
    };
    expect((await service.createRun(companyId, 10, input)).id).toBe(run.id);
    await expect(
      service.createRun(companyId, 10, { ...input, runType: 'OFF_CYCLE' }),
    ).rejects.toThrow('different input');
    await expect(
      service.createRun(companyId, 10, { ...input, idempotencyKey: 'duplicate' }),
    ).rejects.toThrow('already belongs');
    await expect(service.get(foreignId, 'runs', run.id)).rejects.toThrow('not found');
    await expect(
      service.createPeriod(companyId, 10, {
        startDate: '2026-01-02',
        endDate: '2026-01-30',
        paymentDate: '2026-01-30',
      }),
    ).rejects.toThrow('overlap');
    await service.cancel(companyId, 10, run.id, 1);
  });
  test('complete calculation, segregation of duties, closing and payment deduplication', async () => {
    const run = await draft('02');
    await expect(service.transition(companyId, 20, run.id, 1, 'close')).rejects.toThrow();
    const item = await process(run);
    await service.processItem(companyId, item.id);
    expect(await PayrollEmployeeResultModel.count({ where: { companyId, runId: run.id } })).toBe(1);
    expect(await PayrollInputSnapshotModel.count({ where: { companyId, runId: run.id } })).toBe(1);
    const ready = await service.get(companyId, 'runs', run.id);
    const submitted = await service.transition(companyId, 10, run.id, ready.version, 'submit');
    await expect(
      service.transition(companyId, 10, run.id, submitted.version, 'approve'),
    ).rejects.toThrow('different operator');
    const approved = await service.transition(companyId, 20, run.id, submitted.version, 'approve');
    await service.transition(companyId, 20, run.id, approved.version, 'close');
    await service.transition(companyId, 20, run.id, approved.version, 'close');
    expect(await PayrollClosing.count({ where: { companyId, runId: run.id } })).toBe(1);
    const closed = await service.get(companyId, 'runs', run.id);
    await service.preparePayments(companyId, 20, run.id, closed.version);
    await service.preparePayments(companyId, 20, run.id, closed.version);
    expect(await PayrollInstruction.count({ where: { companyId, runId: run.id } })).toBe(1);
    await expect(service.cancel(companyId, 10, run.id, closed.version)).rejects.toThrow();
    expect(
      await PayrollOutboxModel.count({
        where: { companyId, aggregateId: run.id, eventType: 'payroll.run.closed' },
      }),
    ).toBe(1);
    const exported = await service.requestExport(companyId, 20, run.id, 'XLSX', 'export-feb');
    await service.buildExport(companyId, exported.id);
    expect(
      (await service.downloadExport(companyId, exported.id)).buffer.subarray(0, 2).toString(),
    ).toBe('PK');
    const pdf = await service.requestExport(companyId, 20, run.id, 'PDF', 'export-feb-pdf');
    await service.buildExport(companyId, pdf.id);
    expect((await service.downloadExport(companyId, pdf.id)).buffer.subarray(0, 8).toString()).toBe(
      '%PDF-1.4',
    );
    await expect(service.downloadExport(foreignId, pdf.id)).rejects.toThrow('not found');
  });
  test('failed employee can retry without duplicating prior financial results', async () => {
    const run = await draft('03');
    fail = true;
    const item = await process(run);
    fail = false;
    const failed = await service.get(companyId, 'runs', run.id);
    expect(failed.status).toBe('FAILED');
    await expect(
      service.transition(companyId, 20, run.id, failed.version, 'approve'),
    ).rejects.toThrow();
    await service.start(companyId, 10, run.id, failed.version, true);
    await service.processItem(companyId, item.id);
    expect((await service.get(companyId, 'runs', run.id)).status).toBe('READY_FOR_REVIEW');
    expect(await PayrollEmployeeResultModel.count({ where: { companyId, runId: run.id } })).toBe(1);
  });
  test('validation commands queue durably and capture immutable inputs asynchronously', async () => {
    const run = await draft('04');
    const first = await service.queueValidation(companyId, 10, run.id, 1);
    const repeated = await service.queueValidation(companyId, 10, run.id, 1);
    expect(first.id).toBe(repeated.id);
    await service.processValidation(companyId, first.id);
    expect(await PayrollInputSnapshotModel.count({ where: { companyId, runId: run.id } })).toBe(1);
    const validated = await service.get(companyId, 'runs', run.id);
    expect(validated.version).toBe(3);
    await service.start(companyId, 10, run.id, validated.version);
  });
  test('approval policy is captured at submission and requires different approvers', async () => {
    await service.policy(companyId, 10, { code: 'DUAL', requiredApprovals: 2 });
    const run = await draft('05');
    await process(run);
    const ready = await service.get(companyId, 'runs', run.id);
    const submitted = await service.transition(companyId, 10, run.id, ready.version, 'submit');
    await service.policy(companyId, 10, { code: 'SINGLE', requiredApprovals: 1 });
    const first = await service.transition(companyId, 20, run.id, submitted.version, 'approve');
    expect(first.status).toBe('SUBMITTED');
    await expect(
      service.transition(companyId, 20, run.id, first.version, 'approve'),
    ).rejects.toThrow('already approved');
    const second = await service.transition(companyId, 30, run.id, first.version, 'approve');
    expect(second.status).toBe('APPROVED');
  });
  test('regularization preserves the original result and blocks duplicate adjustments', async () => {
    const original = await PayrollRunModel.findOne({ where: { companyId, status: 'CLOSED' } });
    const period = await service.createPeriod(companyId, 10, {
      startDate: '2026-06-01',
      endDate: '2026-06-28',
      paymentDate: '2026-06-28',
    });
    await service.changePeriod(companyId, 10, period.id, 1, 'open');
    const input = {
      periodId: period.id,
      runType: 'CORRECTION' as const,
      executionScope: 'INDIVIDUAL' as const,
      employeeIds: [employeeId],
      idempotencyKey: 'correction-1',
      originalRunId: original!.id,
      reason: 'Corrected source information',
    };
    const correction = await service.createRun(companyId, 10, input);
    await expect(
      service.createRun(companyId, 10, { ...input, idempotencyKey: 'correction-2' }),
    ).rejects.toThrow('adjustment already exists');
    await process(correction);
    expect((await service.get(companyId, 'runs', original!.id)).status).toBe('CLOSED');
    expect(
      await PayrollEmployeeResultModel.count({ where: { companyId, runId: original!.id } }),
    ).toBe(1);
  });
  test('HTTP routes enforce granular permissions before accessing salaries', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { userId: 10 } as typeof req.user;
      req.tenant = { companyId } as typeof req.tenant;
      next();
    });
    const module = createPayrollModule({
      service,
      audit: { record: async () => {} },
      requirePermission: (permission) => (req, res, next) => {
        if (!(req.header('X-Permission') ?? '').split(',').includes(permission)) {
          res.sendStatus(403);
          return;
        }
        next();
      },
    });
    app.use('/payroll', module.routes);
    const simulation = {
      month: '2026-11', baseSalary: '100000', allowance: '7500', annualAllowance: '30000',
      deduction: '5000', deductionAuthorized: true, rounding: 'HALF_EVEN',
    };
    const runCount = await PayrollRunModel.count({ where: { companyId } });
    expect((await request(app).post('/payroll/engine/simulate')
      .set('X-Permission', 'payroll:read').send(simulation)).status).toBe(403);
    const result = await request(app).post('/payroll/engine/simulate')
      .set('X-Permission', 'payroll:read,payroll:runs:create').send(simulation);
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.data).toMatchObject({ tenantId: companyId, netAmount: '99500.00' });
    expect(await PayrollRunModel.count({ where: { companyId } })).toBe(runCount);

    expect((await request(app).get('/payroll/periods')).status).toBe(403);
    expect(
      (await request(app).get('/payroll/periods').set('X-Permission', 'payroll:read')).status,
    ).toBe(200);
  });
});
