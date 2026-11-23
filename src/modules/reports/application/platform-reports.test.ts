import { randomUUID } from 'crypto';
import { sequelize } from '../../../infra/database';
import { PlatformReportsService } from './use-cases/platform-reports.service';
import { PlatformReportRecord } from '../infrastructure/persistence/models/platform-report-record.model';
import { nextReportDue, scheduledScope, ReportScope } from '../domain/platform-report-catalog';
import { payrollPdf, payrollXlsx } from '../../payroll/infrastructure/payroll-export';

jest.mock('../../../infra/database', () => {
  const { Sequelize } = require('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});

describe('Platform report execution and distribution', () => {
  const observations = { checkCompany: jest.fn(), read: jest.fn() };
  const audit = { record: jest.fn() };
  const activeOwner = jest.fn();
  const service = new PlatformReportsService(PlatformReportRecord, observations, audit, { pdf: payrollPdf, xlsx: payrollXlsx }, activeOwner);
  const scope: ReportScope = { from: '2026-11-02', to: '2026-11-08', grouping: 'day' };
  const input = { code: 'REPORT_ACTIVITY' as const, scope };
  beforeAll(() => PlatformReportRecord.sync({ force: true }));
  afterAll(() => sequelize.close());
  beforeEach(async () => {
    jest.resetAllMocks();
    observations.read.mockResolvedValue([{ period: '2026-11-05', category: 'EXECUTION', state: 'COMPLETED', count: 5 }]);
    activeOwner.mockResolvedValue(true);
    await PlatformReportRecord.destroy({ where: {} });
  });

  it('compares equal date windows and persists an idempotent historical run', async () => {
    const preview = await service.preview(input, true);
    expect(preview.comparison?.scope).toMatchObject({ from: '2026-10-26', to: '2026-11-01' });
    const key = randomUUID();
    const saved = await service.run(7, input, key);
    expect(saved).toMatchObject({ status: 'COMPLETED', rowCount: 1 });
    expect((await service.run(7, input, key)).id).toBe(saved.id);
    await expect(service.run(7, { ...input, scope: { ...scope, to: '2026-11-09' } }, key)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.execution(8, saved.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.preview({ code: 'ONBOARDING_ACTIVITY', scope: { ...scope, companyId: 2 } }, false)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('supports retry and expiring, owner-only PDF, Excel and CSV exports', async () => {
    observations.read.mockRejectedValueOnce(new Error('private failure detail'));
    const failed = await service.run(7, input, randomUUID());
    expect(failed).toMatchObject({ status: 'FAILED', failure: 'REPORT_SOURCE_UNAVAILABLE' });
    expect((await service.retry(7, failed.id)).status).toBe('COMPLETED');
    for (const format of ['PDF', 'XLSX', 'CSV'] as const) {
      const file = await service.makeExport(7, failed.id, format);
      const data = await service.download(7, file.id);
      const signature = format === 'PDF' ? '%PDF' : format === 'XLSX' ? 'PK' : '"Report"';
      expect(data.bytes.toString('utf8')).toContain(signature);
      await expect(service.download(8, file.id)).rejects.toMatchObject({ statusCode: 404 });
      await PlatformReportRecord.update({ dueAt: new Date(0) }, { where: { id: file.id } });
      await expect(service.download(7, file.id)).rejects.toMatchObject({ statusCode: 404 });
    }
  });

  it('runs a due schedule once and pauses the schedule when the role has been revoked', async () => {
    const cfg = { title: 'Weekly activity', code: 'REPORT_ACTIVITY' as const, cadence: 'WEEKLY' as const, grouping: 'day' as const };
    const first = await service.createSchedule(7, cfg);
    const revoked = await service.createSchedule(8, cfg);
    const dueAt = new Date('2026-11-09T05:00:00Z');
    await PlatformReportRecord.update({ dueAt }, { where: { kind: 'SCHEDULE' } });
    activeOwner.mockImplementation(async owner => owner === 7);
    await service.tick(dueAt);
    await service.tick(dueAt);
    expect((await service.list(7, 'EXECUTION', 1, 20)).items[0]).toMatchObject({ status: 'COMPLETED', scheduleId: first.id, scope });
    expect((await service.list(7, 'EXECUTION', 1, 20)).total).toBe(1);
    expect((await service.list(8, 'SCHEDULE', 1, 20)).items[0]).toMatchObject({ id: revoked.id, status: 'PAUSED', lastState: 'ACCESS_REVOKED' });
    expect(nextReportDue('MONTHLY', new Date('2026-11-01T05:00:00Z')).toISOString()).toBe('2026-12-01T05:00:00.000Z');
    expect(scheduledScope('MONTHLY', new Date('2026-12-01T05:00:00Z'), undefined, 'month')).toMatchObject({ from: '2026-11-01', to: '2026-11-30' });
  });
});
