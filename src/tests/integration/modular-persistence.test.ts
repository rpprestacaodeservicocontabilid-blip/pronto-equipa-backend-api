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
    expect((await service.usageSummary(1)).reservedBytes).toBe(120);
    await expect(service.get(2, first.documentId!)).rejects.toMatchObject({ statusCode: 404 });
    await service.abortUpload(1, 10, first.sessionId);
    expect((await service.usageSummary(1)).reservedBytes).toBe(0);
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
  });

  it('keeps simulation snapshots on the same version and rejects stale updates', async () => {
    const persistence = new SequelizeSimulationPersistence();
    const service = new SimulationsApplicationService(
      { read: unavailable, selectEmployees: async () => [], officialResults: async () => [] },
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

  it('restricts custom reports to the owning actor and tenant', async () => {
    const source = {
      readSource: async () => [{ firstName: 'Ana' }],
      dashboardData: async () => ({ active: 1, employees: 1, payroll: [] }),
    };
    const membership = {
      findMembership: async () => null,
      findPermissionNames: async () => [],
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
  });
});
