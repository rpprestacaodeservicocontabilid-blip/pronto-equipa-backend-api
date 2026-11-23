import { randomUUID } from 'crypto';
import { sequelize } from '../../../infra/database';
import { CompanyModel } from '../../tenancy/infrastructure/persistence/models/company.model';
import { AuditLogModel } from '../../audit/infrastructure/persistence/models/audit-log.model';
import { PAYSLIPS_MODELS, PayslipModel, PayslipAccessLogModel, PayslipBatchModel, PayslipBatchItemModel, PayslipTemplateVersionModel, PayslipDeliveryModel, PayslipOutboxModel } from './persistence/models/payslips.models';
import { payslipAudit, payslipBatch, payslipBatches, payslipOverview, payslipTemplates, payslipVolume } from './platform-payslips.reader';

jest.mock('../../../infra/database', () => {
  const { Sequelize } = require('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});

describe('Platform payslip supervision', () => {
  const range = { from: '2026-11-20', to: '2026-11-20' };
  const createdAt = new Date('2026-11-19T23:30:00Z');
  const outOfRange = new Date('2026-11-20T23:00:00Z');
  const batchId = randomUUID();
  const employeeId = randomUUID();
  const documentId = randomUUID();
  const privateValue = 'private payroll snapshot';
  let companyId: number;
  let otherCompany: number;

  function record(tenant: number, status: string, data: Record<string, unknown>, id: string = randomUUID(), key: string = id, timestamp = createdAt) {
    return { id, companyId: tenant, key, status, data, runId: null, employeeId, createdAt: timestamp, updatedAt: timestamp };
  }

  beforeAll(async () => {
    await CompanyModel.sync();
    await AuditLogModel.sync();
    for (const model of PAYSLIPS_MODELS) await model.sync();
    companyId = (await CompanyModel.create({ name: 'First company', slug: 'first-company', status: 'ACTIVE', timezone: 'Africa/Luanda', locale: 'pt-AO' })).id;
    otherCompany = (await CompanyModel.create({ name: 'Second company', slug: 'second-company', status: 'ACTIVE', timezone: 'Africa/Luanda', locale: 'pt-AO' })).id;
    await PayslipModel.bulkCreate([
      record(companyId, 'PUBLISHED', { type: 'REGULAR', snapshot: { employee: privateValue, netAmount: '12345.67', documentId } }, documentId),
      record(companyId, 'PUBLISHED', { type: 'CORRECTION' }, undefined, undefined, outOfRange),
      record(otherCompany, 'GENERATION_FAILED', { type: 'OFF_CYCLE', reason: privateValue }),
    ]);
    await PayslipBatchModel.create(record(companyId, 'PARTIALLY_COMPLETED', { type: 'REGULAR', totalItems: 2, completedItems: 1, failedItems: 1, privateValue }, batchId));
    await PayslipBatchItemModel.bulkCreate([
      record(companyId, 'GENERATED', { privateValue }, undefined, batchId + ':household1'),
      record(companyId, 'GENERATION_FAILED', { privateValue }, undefined, batchId + ':household2'),
    ]);
    await PayslipTemplateVersionModel.create(record(companyId, 'DRAFT', { templateId: randomUUID(), version: 'v2.3', layout: privateValue }));
    await PayslipAccessLogModel.bulkCreate([
      record(companyId, 'RECORDED', { action: 'VERIFY', valid: false }),
      record(companyId, 'RECORDED', { action: 'DOWNLOAD', actorId: 42, file: privateValue }),
    ]);
    await AuditLogModel.create({ companyId, action: 'payslips.payslip.published', entityType: 'payslip', entityId: documentId, after: { privateValue }, createdAt });
    await PayslipDeliveryModel.create(record(companyId, 'PENDING', { channel: 'PORTAL', status: 'AVAILABLE' }));
    await PayslipOutboxModel.create(record(companyId, 'PENDING', { eventType: 'payslips.payslip.published', privateValue }));
  });
  afterAll(() => sequelize.close());

  it('uses Luanda dates and returns company totals without individual information', async () => {
    const global = await payslipOverview(range);
    expect(global).toMatchObject({ published: 1, failed: 1, companyCount: 2 });
    expect(global.metrics).toEqual(expect.arrayContaining([
      { category: 'integrity', status: 'MISMATCH', total: 1 },
      { category: 'portal', status: 'AVAILABLE', total: 1 },
      { category: 'delivery', status: 'PENDING', total: 1 },
    ]));
    expect(await payslipVolume({ ...range, granularity: 'day', companyId })).toEqual([
      { period: range.from, type: 'REGULAR', status: 'PUBLISHED', total: 1 },
    ]);
    expect(await payslipVolume({ ...range, granularity: 'month', type: 'OFF_CYCLE' })).toEqual([
      { period: '2026-11', type: 'OFF_CYCLE', status: 'GENERATION_FAILED', total: 1 },
    ]);
    expect(JSON.stringify(global)).not.toMatch(/12345\.67|private payroll snapshot/);
  });

  it('keeps batch lookups tenant-scoped and exposes aggregate progress only', async () => {
    const result = await payslipBatches({ ...range, companyId, failures: true, page: 1, limit: 1 });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ id: batchId, status: 'PARTIALLY_COMPLETED', failed: 1, completed: 1 });
    const detail = await payslipBatch(companyId, batchId);
    expect(detail.progress).toHaveLength(2);
    expect(JSON.stringify(detail)).not.toContain(employeeId);
    await expect(payslipBatch(otherCompany, batchId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('projects template versions and audit counts without payloads or document identifiers', async () => {
    const templates = await payslipTemplates(companyId, { page: 1, limit: 20 });
    expect(templates.items[0]).toMatchObject({ version: 'v2.3', status: 'DRAFT' });
    const audit = await payslipAudit({ ...range, companyId, granularity: 'day' });
    expect(audit.map(row => row.event)).toContain('access.DOWNLOAD');
    expect(audit.map(row => row.event)).toContain('payslips.payslip.published');
    const serialized = JSON.stringify({ audit, templates });
    expect(serialized).not.toContain(documentId);
    expect(serialized).not.toContain(privateValue);
    expect(serialized).not.toContain('actorId');
  });
});
