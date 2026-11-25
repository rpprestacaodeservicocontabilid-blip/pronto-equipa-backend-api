jest.mock('../../infra/database', () => {
  const { Sequelize } = require('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});

import { sequelize } from '../../infra/database';
import { DocumentsApplicationService } from '../../modules/documents/application/use-cases/documents-application.service';
import { DocumentUploadPort } from '../../modules/documents/application/ports/document.ports';
import { SequelizeDocumentPersistence } from '../../modules/documents/infrastructure/persistence/repositories/sequelize-document-persistence';
import { SubscriptionsApplicationService } from '../../modules/subscriptions/application/use-cases/subscriptions-application.service';
import { SequelizeSubscriptionPersistence } from '../../modules/subscriptions/infrastructure/persistence/repositories/sequelize-subscription-persistence';
import { SimulationsApplicationService } from '../../modules/simulations/application/use-cases/simulations-application.service';
import { SequelizeSimulationPersistence } from '../../modules/simulations/infrastructure/persistence/repositories/sequelize-simulation-persistence';
import { PayslipsApplicationService } from '../../modules/payslips/application/use-cases/payslips-application.service';
import { SequelizePayslipPersistence } from '../../modules/payslips/infrastructure/persistence/repositories/sequelize-payslip-persistence';
import { ReportsApplicationService } from '../../modules/reports/application/use-cases/reports-application.service';
import { SequelizeReportStore } from '../../modules/reports/infrastructure/persistence/repositories/sequelize-report-store';
import { SequelizeReportSource } from '../../modules/reports/infrastructure/adapters/sequelize-report-source';
import { ReportsRecordModel } from '../../modules/reports/infrastructure/persistence/models/reports.models';
import { PayrollEmployeeResultModel, PayrollPeriodModel, PayrollRunModel } from '../../modules/payroll/infrastructure/persistence/models/payroll.models';
import { randomUUID } from 'crypto';
import { REPORT_CATALOG } from '../../modules/reports/domain/report-catalog';
import { PaymentsApplicationService } from '../../modules/payments/application/use-cases/payments-application.service';
import { SequelizePaymentPersistence } from '../../modules/payments/infrastructure/persistence/repositories/sequelize-payment-persistence';
import { RecordStoreContext } from '../../shared/application/ports/record-store.port';

const audit = { record: jest.fn(async () => {}) };
const exportRenderer = { pdf: () => Buffer.from('pdf'), xlsx: () => Buffer.from('xlsx') };
const unavailable = async (): Promise<never> => {
  throw new Error('Unexpected external operation');
};
const storage: DocumentUploadPort = {
  createUpload: jest.fn(async (input) => ({
    storageKey: `tenant/${input.companyId}/${input.uploadId}`,
    mode: 'SINGLE' as const,
    expiresAt: '2030-01-01T00:00:00Z',
    parts: [],
  })),
  completeUpload: unavailable,
  abortUpload: jest.fn(async () => {}),
  downloadUrl: unavailable,
  readObject: unavailable,
  promoteObject: unavailable,
  deleteObject: unavailable,
};

describe('Module application services through independent persistence ports', () => {
  beforeEach(async () => {
    await sequelize.sync({ force: true });
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await sequelize.close();
  });

  it('reserves upload quota once, isolates tenants and releases quota on abort', async () => {
    const service = new DocumentsApplicationService(
      storage,
      { scan: async () => 'CLEAN' },
      audit,
      new SequelizeDocumentPersistence(),
    );
    const input = {
      name: 'contract.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 120,
      idempotencyKey: 'upload-contract-1',
    };
    const first = await service.createUpload(1, 10, input);
    const replay = await service.createUpload(1, 10, input);
    expect(replay.sessionId).toBe(first.sessionId);
    expect(storage.createUpload).toHaveBeenCalledTimes(1);
    await expect(service.createUpload(1, 11, input)).rejects.toMatchObject({ statusCode: 403 });
    expect((await service.usageSummary(1)).reservedBytes).toBe(120);
    await expect(service.get(2, first.documentId!)).rejects.toMatchObject({ statusCode: 404 });
    expect((await service.oversight(1)).byStatus).toEqual({ PENDING_UPLOAD: 1 });
    expect((await service.oversight(2)).byStatus).toEqual({});
    const [queued] = (await service.administration(1, 'uploads', 1, 25)).items;
    expect(queued).not.toHaveProperty('parts');
    expect(queued).not.toHaveProperty('storageKey');
    expect(await service.list(1, { page: 1, limit: 25, search: 'not-found' })).toEqual([]);
    await service.abortUpload(1, 10, first.sessionId);
    expect((await service.usageSummary(1)).reservedBytes).toBe(0);
  });

  it('reviews an uploaded version independently and keeps the previous version after rejection', async () => {
    const persistence = new SequelizeDocumentPersistence();
    const service = new DocumentsApplicationService(storage, { scan: async () => 'CLEAN' }, audit, persistence);
    const original = await service.createUpload(1, 10, {
      name: 'test.pdf', mimeType: 'application/pdf', sizeBytes: 120, idempotencyKey: 'document-version-first',
    });
    await persistence.collections.document.transaction(1, async transaction => {
      const row = (await persistence.collections.document.findOne({ where: { id: original.documentId }, transaction }))!;
      await persistence.update(row, { status: 'ACTIVE', data: { ...row.data, pendingVersionId: null, currentVersionId: original.versionId } }, { transaction });
    });
    const replacement = await service.createUpload(1, 10, {
      name: 'new.pdf', mimeType: 'application/pdf', sizeBytes: 120, idempotencyKey: 'document-version-second', documentId: original.documentId,
    });
    await persistence.collections.document.transaction(1, async transaction => {
      const row = (await persistence.collections.document.findOne({ where: { id: original.documentId }, transaction }))!;
      await persistence.update(row, { status: 'PENDING_VALIDATION' }, { transaction });
    });
    await service.submitValidation(1, 10, original.documentId!);
    await expect(service.decideValidation(1, 10, original.documentId!, 'APPROVED')).rejects.toMatchObject({ statusCode: 403 });
    await service.decideValidation(1, 11, original.documentId!, 'REJECTED', 'Wrong attachment');
    expect(await service.get(1, original.documentId!)).toMatchObject({ status: 'ACTIVE', currentVersionId: original.versionId, pendingVersionId: null });
    expect((await service.versions(1, original.documentId!)).find(row => row.id === replacement.versionId)?.status).toBe('REJECTED');
    const request = await service.requestDeletion(1, 10, original.documentId!, 'Retention review');
    await service.createHold(1, 12, original.documentId!, { reason: 'Legal preservation' });
    await expect(service.decideDeletion(1, 11, request.id, true)).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.administration(1, 'deletions', 1, 25)).items[0].status).toBe('PENDING');
  });

  it('rolls back writes to multiple collections and rejects an expired transaction context', async () => {
    const persistence = new SequelizeDocumentPersistence();
    let expired: RecordStoreContext | undefined;
    await expect(
      persistence.collections.document.transaction(1, async (transaction) => {
        expired = transaction;
        const base = {
          companyId: 1,
          status: 'ACTIVE',
          runId: null,
          employeeId: null,
          version: 1,
          data: {},
        };
        await persistence.collections.document.create(
          { ...base, id: 'document-1', key: 'document-1' },
          { transaction },
        );
        await persistence.collections.documentVersion.create(
          { ...base, id: 'version-1', key: 'version-1' },
          { transaction },
        );
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await persistence.collections.document.count({ where: { companyId: 1 } })).toBe(0);
    expect(await persistence.collections.documentVersion.count({ where: { companyId: 1 } })).toBe(
      0,
    );
    await expect(
      persistence.collections.document.findAll({ where: { companyId: 1 }, transaction: expired }),
    ).rejects.toThrow('Inactive unit of work');
  });

  it('publishes a subscription plan and increments its version without ORM objects', async () => {
    const service = new SubscriptionsApplicationService(
      audit,
      new SequelizeSubscriptionPersistence(),
    );
    const input = {
      code: 'STANDARD',
      name: 'Standard',
      type: 'STANDARD',
      prices: [{ currency: 'AOA', interval: 'MONTHLY' as const, amount: '1000.00' }],
      features: {},
      limits: {},
    };
    const plan = await service.createPlan(10, input);
    const first = await service.createPlanVersion(10, plan.id, input);
    expect((await service.publishPlan(10, plan.id, first.id)).status).toBe('PUBLISHED');
    const second = await service.createPlanVersion(10, plan.id, input);
    expect(second.version).toBe(2);
    expect(second).not.toHaveProperty('dataValues');
    await expect(service.createPlan(10, input)).rejects.toMatchObject({ statusCode: 409 });
    const pending = await service.createSubscription(1, 10, {
      planVersionId: first.id, interval: 'MONTHLY', idempotencyKey: 'paid-subscription-1',
    });
    expect(pending.status).toBe('PENDING_PAYMENT');
    await expect(service.setStatus(1, 10, 'ACTIVE', 'Manual activation', pending.id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.adminRecords(2, pending.id, 'history', 1, 25)).rejects.toMatchObject({ statusCode: 404 });
    expect((await service.adminRecords(1, pending.id, 'history', 1, 25)).total).toBeGreaterThan(0);
    await service.updatePolicy(10, { graceDays: 12 });
    expect(await service.policy(1)).toMatchObject({ graceDays: 12, trialDays: 14 });
    await service.applyBillingEvent({
      eventId: 'test-paid-subscription', type: 'platform-billing.payment.confirmed',
      companyId: 1, subscriptionId: pending.id, invoiceId: 'test-invoice',
    });
    await service.setStatus(1, 10, 'SUSPENDED', 'Administrative suspension', pending.id);
    await expect(service.reactivate(1, 22, pending.id)).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.setStatus(1, 10, 'ACTIVE', 'Administrative review', pending.id)).status).toBe('ACTIVE');
  });

  it('keeps simulation snapshots on the same version and rejects stale updates', async () => {
    const persistence = new SequelizeSimulationPersistence();
    const workerId = '21355f49-fc13-4fc5-aff1-88d860d907c0';
    const service = new SimulationsApplicationService(
      { read: unavailable, selectEmployees: async () => [workerId], officialResults: async () => [] },
      { calculate: unavailable },
      audit,
      persistence,
      exportRenderer,
    );
    const scenario = await service.createScenario(1, 10, {
      name: 'Forecast',
      type: 'CUSTOM',
      configuration: {
        period: { startDate: '2026-01-01', endDate: '2026-01-31' },
        adjustments: [],
      },
    });
    const updated = await service.updateScenario(1, 10, scenario.id, {
      name: 'Revised',
      expectedVersion: 1,
    });
    expect(updated.version).toBe(2);
    const versions = await persistence.collections.simulationScenarioVersion.findAll({
      where: { companyId: 1, runId: scenario.id },
      order: [['version', 'ASC']],
    });
    expect(versions.map((row) => row.version)).toEqual([1, 2]);
    await expect(
      service.updateScenario(1, 10, scenario.id, { name: 'Stale', expectedVersion: 1 }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.getScenario(2, scenario.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.listScenarios(1, { type: 'CUSTOM', limit: 1 })).resolves.toEqual([
      expect.objectContaining({ id: scenario.id }),
    ]);
    await expect(service.listScenarios(1, { type: 'PROMOTION' })).resolves.toEqual([]);
    const enqueue = jest.fn(async () => {});
    service.setEnqueuer(enqueue);
    const request = { idempotencyKey: 'simulation-test-run', version: 2 };
    const run = await service.executeScenario(1, 10, scenario.id, request);
    expect(run).toMatchObject({ status: 'PENDING', executionScope: 'bulk', queued: true });
    await expect(service.executeScenario(1, 10, scenario.id, request)).resolves.toMatchObject({ id: run.id, idempotent: true });
    await expect(service.executeScenario(1, 10, scenario.id, { ...request, employeeIds: [] }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(service.executeScenario(1, 10, scenario.id, {
      ...request, period: { startDate: '2026-02-01', endDate: '2026-02-28' },
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(enqueue).toHaveBeenCalledTimes(1);
    await service.cancelRun(1, 10, run.id);
    await service.processRun(1, run.id);
    await expect(service.oversight(1)).resolves.toMatchObject({ runs: { CANCELLED: 1 }, scenarios: { DRAFT: 1 } });
    await expect(service.oversight(2)).resolves.toEqual({ runs: {}, scenarios: {}, proposals: {} });
  });

  it('persists and publishes payslip templates while restricting tenant access', async () => {
    const service = new PayslipsApplicationService(
      audit,
      { put: unavailable, read: unavailable, remove: unavailable },
      { render: () => Buffer.from('pdf') },
      new SequelizePayslipPersistence(),
      {
        results: { findOne: unavailable, findAll: unavailable },
        runs: { findOne: unavailable, findAll: unavailable },
        periods: { findOne: unavailable, findAll: unavailable },
        employees: { findOne: unavailable, findAll: unavailable },
        company: unavailable,
        hasActiveMembership: async () => false,
      },
      exportRenderer,
    );
    const template = await service.createTemplate(1, 10, { code: 'STANDARD', name: 'Standard' });
    const version = await service.createTemplateVersion(1, 10, {
      templateId: template.id,
      version: '1',
      layoutConfig: {},
    });
    await service.publishTemplateVersion(1, 10, version.id);
    const loaded = await service.getTemplate(1, template.id);
    expect(loaded.versions[0].status).toBe('PUBLISHED');
    await expect(service.getTemplate(2, template.id)).rejects.toThrow('not found');
  });

  it('publishes only the exact generated receipt for a batch item', async () => {
    const persistence = new SequelizePayslipPersistence();
    const worker = randomUUID();
    const run = randomUUID();
    const result = randomUUID();
    const batch = randomUUID();
    const expected = randomUUID();
    const other = randomUUID();
    const service = new PayslipsApplicationService(
      audit,
      { put: unavailable, read: unavailable, remove: unavailable },
      { render: () => Buffer.from('pdf') },
      persistence,
      {
        results: { findOne: unavailable, findAll: unavailable }, runs: { findOne: unavailable, findAll: unavailable },
        periods: { findOne: unavailable, findAll: unavailable }, employees: { findOne: unavailable, findAll: unavailable },
        company: unavailable, hasActiveMembership: async () => false,
      },
      exportRenderer,
    );
    const stores = persistence.collections;
    await stores.payslipBatch.create({ id: batch, companyId: 1, runId: run, employeeId: null, status: 'COMPLETED', key: 'batch:' + batch,
      data: { id: batch, payrollRunId: run, type: 'REGULAR' } });
    await stores.payslipBatchItem.create({ id: randomUUID(), companyId: 1, runId: run, employeeId: worker, status: 'GENERATED',
      key: batch + ':' + worker, data: { batchId: batch, payrollResultId: result, employeeId: worker, status: 'GENERATED' } });
    for (const row of [{ id: other, key: result + ':SUPPLEMENTARY' }, { id: expected, key: result + ':REGULAR' }]) {
      await stores.payslip.create({ ...row, companyId: 1, runId: run, employeeId: worker, status: 'VALIDATED',
        data: { id: row.id, type: row.id === expected ? 'REGULAR' : 'SUPPLEMENTARY', status: 'VALIDATED' } });
    }
    await expect(service.publishBatch(1, 10, batch)).resolves.toMatchObject({ published: 1 });
    await expect(service.get(1, expected)).resolves.toMatchObject({ status: 'PUBLISHED' });
    await expect(service.get(1, other)).resolves.toMatchObject({ status: 'VALIDATED' });
    await expect(service.publishBatch(1, 10, batch)).resolves.toMatchObject({ published: 0 });
    await expect(service.reportSummary(1)).resolves.toMatchObject({ totalGenerated: 2, published: 1 });
    await expect(service.get(2, expected)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('restricts custom reports to the owning actor and tenant', async () => {
    const source = {
      readSource: async () => [{ firstName: 'Ana' }],
      dashboardData: async () => ({ active: 1, employees: 1, payroll: [] }),
    };
    const membership = {
      findMembership: async () => null,
      findPermissionNames: async () => ['reports:hr:read'],
      findActiveCompanyIds: async () => [],
    };
    const service = new ReportsApplicationService(
      audit,
      new SequelizeReportStore(),
      source,
      exportRenderer,
      membership,
    );
    const { code } = REPORT_CATALOG.find((report) => report.source === 'employees')!;
    const report = await service.saveCustomReport(1, 10, {
      code,
      name: 'Team',
      fields: ['firstName'],
    });
    expect((await service.previewCustomReport(1, 10, report.id, {})).rowCount).toBe(1);
    await expect(service.previewCustomReport(1, 11, report.id, {})).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.previewCustomReport(2, 10, report.id, {})).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('uses closed payroll evidence for fiscal reports and revalidates snapshot exports', async () => {
    const periodId = randomUUID();
    const employeeId = randomUUID();
    await PayrollPeriodModel.create({
      id: periodId, companyId: 1, startDate: '2026-09-01', endDate: '2026-09-30',
      paymentDate: '2026-09-30', status: 'CLOSED', version: 1, createdBy: 10,
    });
    for (const status of ['CLOSED', 'DRAFT']) {
      const runId = randomUUID();
      await PayrollRunModel.create({
        id: runId, companyId: 1, periodId, runType: 'REGULAR', executionScope: 'INDIVIDUAL',
        employeeIds: [employeeId], status, version: 1, createdBy: 10, idempotencyKey: runId, requestHash: 'test',
      });
      await PayrollEmployeeResultModel.create({
        id: randomUUID(), companyId: 1, runId, employeeId, grossAmount: '100.00', deductionsAmount: '10.01',
        netAmount: '89.99', employerCostsAmount: '3.00', currency: 'AOA', calculationSnapshot: {
          legalRuleSetVersion: '2026.1', lines: [
            { code: 'IRT', amount: status === 'CLOSED' ? '8.01' : '91.00' },
            { code: 'INSS_EMPLOYEE', amount: '2.00' }, { code: 'INSS_EMPLOYER', amount: '3.00' },
          ],
        },
      });
    }
    let grants = ['reports:tax:read', 'reports:payroll:read', 'reports:salary:read-sensitive'];
    const service = new ReportsApplicationService(audit, new SequelizeReportStore(),
      new SequelizeReportSource(), exportRenderer, {
        findMembership: async () => null, findPermissionNames: async () => grants, findActiveCompanyIds: async () => [],
      });
    const filters = { from: '2026-09-01', to: '2026-09-30' };
    const tax = await service.execute(1, 10, 'RPT-TAX-001', filters);
    expect(tax.data).toEqual([{ runId: expect.any(String), employeeId, currency: 'AOA', legalRuleSetVersion: '2026.1', irt: '8.01' }]);
    const inss = await service.execute(1, 10, 'RPT-TAX-003', filters);
    expect(inss.data).toEqual([{ runId: expect.any(String), employeeId, currency: 'AOA', legalRuleSetVersion: '2026.1',
      employeeInss: '2.00', employerInss: '3.00' }]);
    await expect(service.dashboardFor(1, 10, filters)).resolves.toMatchObject({
      payrollByCurrency: [{ currency: 'AOA', personnelCost: '103.00', closedResults: 1 }],
    });
    const file = await service.exportExecution(1, 10, tax.id, 'CSV');
    expect((await service.downloadExport(1, 10, file.id)).content.toString()).toContain('"8.01"');
    expect(await service.listExecutions(1, 10)).toHaveLength(2);
    await expect(service.downloadExport(2, 10, file.id)).rejects.toMatchObject({ statusCode: 404 });
    grants = ['reports:tax:read', 'reports:payroll:read'];
    expect(await service.catalog(1, 10)).toEqual([]);
    await expect(service.dashboardFor(1, 10, filters)).resolves.toMatchObject({ payrollByCurrency: [] });
    await expect(service.downloadExport(1, 10, file.id)).rejects.toMatchObject({ statusCode: 403 });
    grants.push('reports:salary:read-sensitive');
    await ReportsRecordModel.update({ createdAt: new Date(0) }, { where: { id: file.id }, silent: true });
    await expect(service.downloadExport(1, 10, file.id)).rejects.toMatchObject({ statusCode: 410 });
  });

  it('creates one payment instruction from the closed result and preserves approval rules', async () => {
    const persistence = new SequelizePaymentPersistence();
    const sources = {
      results: {
        findOne: async () => ({
          id: 'result-1',
          companyId: 1,
          runId: 'run-1',
          employeeId: 'employee-1',
          grossAmount: '100.00',
          deductionsAmount: '0.00',
          netAmount: '100.00',
          employerCostsAmount: '0.00',
          currency: 'AOA',
          calculationSnapshot: {},
        }),
      },
      runs: {
        findOne: async () => ({
          id: 'run-1',
          companyId: 1,
          periodId: 'period-1',
          runType: 'REGULAR' as const,
          executionScope: 'INDIVIDUAL' as const,
          employeeIds: ['employee-1'],
          status: 'CLOSED' as const,
          version: 1,
          requestHash: '',
          originalRunId: null,
          reason: null,
          idempotencyKey: '',
          createdBy: 10,
        }),
      },
      history: { findAll: async () => [] },
    };
    const service = new PaymentsApplicationService(audit, [], persistence, sources);
    const input = { payrollResultId: 'result-1', employeeId: 'employee-1' };
    const instruction = await service.createInstruction(1, 10, input);
    expect((await service.createInstruction(1, 10, input)).id).toBe(instruction.id);
    await persistence.instruction.updateWhere({
      beneficiarySnapshot: { name: 'Test worker', bankCode: 'TEST', accountFingerprint: '0012', accountNumberCiphertext: 'opaque' },
    }, { where: { id: instruction.id, companyId: 1 } });
    const safeInstruction = await service.getInstruction(1, instruction.id);
    expect(safeInstruction.beneficiary?.accountNumber).toBe('••••0012');
    expect(safeInstruction).not.toHaveProperty('beneficiarySnapshot');
    expect(await persistence.instruction.count({ where: { companyId: 1 } })).toBe(1);
    await expect(service.createInstruction(1, 10, { ...input, amount: '99.00' })).rejects.toThrow(
      'exactly',
    );
    await persistence.batch.create({
      id: 'batch-1',
      companyId: 1,
      code: 'B1',
      sourceAccountId: 'account-1',
      totalAmount: '100.00',
      currency: 'AOA',
      status: 'SUBMITTED',
      createdBy: 10,
    });
    await expect(service.approveBatch(1, 10, 'batch-1')).rejects.toThrow('creator');
    expect((await service.approveBatch(1, 11, 'batch-1')).status).toBe('APPROVED');
    expect(await persistence.approval.count({ where: { companyId: 1 } })).toBe(1);
    await expect(service.approveBatch(1, 12, 'batch-1')).rejects.toThrow('submitted');
    await expect(service.getBatch(2, 'batch-1')).rejects.toThrow('not found');

    for (const id of ['account-1', 'account-2']) {
      await persistence.bankAccount.create({ id, companyId: 1, bankCode: 'TEST', accountName: id,
        accountCiphertext: 'test', accountFingerprint: '0001', currency: 'AOA', status: 'VERIFIED', isPrimary: false });
    }
    for (const reference of ['wrong-source', 'matching-source']) {
      const orderId = randomUUID(), txId = randomUUID();
      const settledAt = new Date('2026-09-30T10:00:00Z');
      await persistence.order.create({ id: orderId, companyId: 1, batchId: 'batch-1', instructionId: instruction.id,
        providerId: 'test', amount: '100.00', currency: 'AOA', status: 'SETTLED', idempotencyKey: orderId, createdBy: 12 });
      await persistence.transaction.create({ id: txId, companyId: 1, orderId, providerReference: reference,
        amount: '100.00', currency: 'AOA', status: 'SETTLED', settledAt });
      const correctSource = reference === 'matching-source';
      const statement = { sourceAccountId: correctSource ? 'account-1' : 'account-2', fileName: 'test.json',
        entries: [{ externalReference: reference, transactionDate: settledAt.toISOString(), amount: '100.00', currency: 'AOA', direction: 'DEBIT' as const }] };
      const saved = await service.importStatement(1, 12, statement);
      expect((await service.importStatement(1, 12, statement)).id).toBe(saved.id);
      const reconciled = await service.runReconciliation(1, 12, reference);
      expect(reconciled.status).toBe(correctSource ? 'MATCHED' : 'RECONCILIATION_EXCEPTION');
      const tx = await service.getTransaction(1, txId);
      expect(tx.status).toBe(correctSource ? 'RECONCILED' : 'SETTLED');
      if (correctSource) {
        await expect(service.transactionEvidence(1, 12, txId)).resolves.toMatchObject({ reference, currency: 'AOA', amount: '100.00' });
        await expect(service.transactionEvidence(2, 12, txId)).rejects.toMatchObject({ statusCode: 404 });
      } else {
        await expect(service.resolveReconciliationException(1, 12, reconciled.id, { notes: 'Reviewed', evidence: ['statement-review'] }))
          .resolves.toMatchObject({ status: 'RESOLVED' });
      }
    }
    expect((await service.getSummary(1)).byCurrency[0].currency).toBe('AOA');
  });
});
