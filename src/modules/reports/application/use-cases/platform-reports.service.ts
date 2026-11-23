import { randomUUID } from 'crypto';
import { Op, UniqueConstraintError } from 'sequelize';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { BadRequestError, ConflictError, NotFoundError } from '../../../../shared/errors/app.error';
import type { PlatformReportRecord, PlatformReportKind } from '../../infrastructure/persistence/models/platform-report-record.model';
import {
  Cadence, catalogue, defaultReportPolicy, nextReportDue, Observation, platformReportCatalog,
  PlatformReportCode, previousScope, ReportFormat, ReportScope, scheduledScope,
} from '../../domain/platform-report-catalog';
import type { ReportRendererPort } from '../ports/report-source.port';

const day = 86400000;
const leaseMs = 300000;
const maxRows = 10000;
type EntryKind = Exclude<PlatformReportKind, 'POLICY'>;
type Request = { code: PlatformReportCode; scope: ReportScope };
type Execution = Request & { rows?: Observation[]; durationMs?: number; failure?: string; scheduleId?: string; version: number; fingerprint: string };
type Template = Request & { title: string; rootId: string; version: number };
type Schedule = { code: PlatformReportCode; title: string; cadence: Cadence; companyId?: number; grouping: ReportScope['grouping']; lastExecutionId?: string; lastState?: string };
type Export = { executionId: string; format: ReportFormat; filename: string; rowCount: number };
type Policy = typeof defaultReportPolicy;
interface Observations {
  checkCompany(id: number): Promise<void>;
  read(code: PlatformReportCode, scope: ReportScope): Promise<Observation[]>;
}

export class PlatformReportsService {
  constructor(
    private readonly records: typeof PlatformReportRecord,
    private readonly observations: Observations,
    private readonly audit: AuditRecorderPort,
    private readonly renderer: ReportRendererPort,
    private readonly activePlatformOwner: (id: number) => Promise<boolean>,
  ) {}

  catalogue = catalogue;

  preview(input: Request, compare: boolean) {
    return this.validateScope(input).then(async () => {
      const capturedAt = new Date().toISOString();
      const rows = await this.readRows(input);
      if (!compare) return { rows, capturedAt };
      const scope = previousScope(input.scope);
      const previous = await this.readRows({ ...input, scope });
      return { rows, capturedAt, comparison: { scope, rows: previous } };
    });
  }

  private async validateScope(input: Request) {
    const policy = (await this.policy()).current;
    const span = Date.parse(input.scope.to) - Date.parse(input.scope.from);
    if (!Number.isFinite(span) || span < 0 || span >= policy.maxDays * day) {
      throw new BadRequestError('Select a date range of up to ' + policy.maxDays + ' days.');
    }
    if (input.scope.companyId !== undefined) {
      if (!platformReportCatalog[input.code].companyFilter) throw new BadRequestError('This report uses a platform-wide scope.');
      await this.observations.checkCompany(input.scope.companyId);
    }
  }

  private async readRows(input: Request) {
    const rows = await this.observations.read(input.code, input.scope);
    if (rows.length > maxRows) throw new BadRequestError('Narrow the date range or group the report by month.');
    return rows;
  }

  private owned(ownerId: number, kind: EntryKind, id: string) {
    return this.records.findOne({ where: { id, ownerId, kind } }).then(record => {
      if (!record) throw new NotFoundError('Report record');
      return record;
    });
  }

  async list(ownerId: number, kind: EntryKind, page: number, limit: number) {
    const { rows, count } = await this.records.findAndCountAll({
      where: { ownerId, kind }, order: [['createdAt', 'DESC'], ['id', 'DESC']],
      offset: (page - 1) * limit, limit,
    });
    return { items: rows.map(record => this.present(record)), total: count, page, limit };
  }

  private present(row: PlatformReportRecord) {
    const status = row.kind === 'EXPORT' && row.dueAt && row.dueAt.getTime() <= Date.now() ? 'EXPIRED' : row.status;
    const base = { id: row.id, status, kind: row.kind, createdAt: row.createdAt, updatedAt: row.updatedAt, dueAt: row.dueAt };
    if (row.kind === 'EXECUTION') {
      const { code, scope, version, rows, failure, durationMs, scheduleId } = row.data as unknown as Execution;
      return { ...base, code, scope, version, rowCount: rows?.length ?? 0, failure, durationMs, scheduleId };
    }
    return { ...base, ...row.data };
  }

  async execution(ownerId: number, id: string) {
    const row = await this.owned(ownerId, 'EXECUTION', id);
    const { rows, code } = row.data as unknown as Execution;
    await this.record(ownerId, 'result.read', row.id, { code });
    return { ...this.present(row), rows: rows ?? [] };
  }

  async run(ownerId: number, input: Request, key: string, scheduleId?: string) {
    const fingerprint = JSON.stringify([input.code, input.scope.from, input.scope.to, input.scope.grouping, input.scope.companyId ?? null]);
    const where = { ownerId, kind: 'EXECUTION', key };
    let row = await this.records.findOne({ where });
    if (!row) {
      await this.validateScope(input);
      try {
        row = await this.records.create({ ...where, id: randomUUID(), status: 'QUEUED', dueAt: null, data: { ...input, version: 1, fingerprint, scheduleId } });
      } catch (error) {
        if (!(error instanceof UniqueConstraintError)) throw error;
        row = await this.records.findOne({ where });
        if (!row) throw error;
      }
    }
    if (row.data.fingerprint !== fingerprint) throw new ConflictError('The request key already belongs to another report.');
    return this.process(row, false);
  }

  async retry(ownerId: number, id: string) {
    const row = await this.owned(ownerId, 'EXECUTION', id);
    if (row.status !== 'FAILED') throw new ConflictError('Only failed runs can be retried.');
    return this.process(row, true);
  }

  private async process(row: PlatformReportRecord, retry: boolean) {
    const stale = row.status === 'RUNNING' && Date.now() >= (row.dueAt?.getTime() ?? row.updatedAt.getTime() + leaseMs);
    if (row.status !== 'QUEUED' && !(row.status === 'FAILED' && retry) && !stale) return this.present(row);
    const started = Date.now();
    const leaseUntil = new Date(started + leaseMs);
    const [claimed] = await this.records.update({ status: 'RUNNING', dueAt: leaseUntil }, {
      where: { id: row.id, status: row.status, dueAt: row.dueAt ?? null },
    });
    if (!claimed) return this.present(await row.reload());
    const data = row.data as unknown as Execution;
    let status = 'COMPLETED';
    let result: Execution;
    try {
      const rows = await this.readRows(data);
      result = { ...data, rows, failure: undefined, durationMs: Date.now() - started };
    } catch (error) {
      status = 'FAILED';
      result = { ...data, rows: [], failure: error instanceof BadRequestError ? 'REPORT_LIMIT_EXCEEDED' : 'REPORT_SOURCE_UNAVAILABLE',
        durationMs: Date.now() - started };
    }
    const [changed] = await this.records.update({ status, data: result, dueAt: null }, {
      where: { id: row.id, status: 'RUNNING', dueAt: leaseUntil },
    });
    if (changed) await this.record(row.ownerId, status === 'COMPLETED' ? 'execution.completed' : 'execution.failed', row.id, {
      code: data.code, companyId: data.scope.companyId ?? null, rows: result.rows?.length ?? 0, durationMs: result.durationMs,
    });
    return this.present(await row.reload());
  }

  async makeExport(ownerId: number, id: string, format: ReportFormat) {
    const result = await this.owned(ownerId, 'EXECUTION', id);
    if (result.status !== 'COMPLETED') throw new ConflictError('The report must finish before export.');
    const policy = (await this.policy()).current;
    const { code, scope, rows } = result.data as unknown as Execution;
    const filename = code.toLowerCase().replace(/_/g, '-') + '-' + scope.to + '.' + format.toLowerCase();
    const row = await this.records.create({
      id: randomUUID(), ownerId, kind: 'EXPORT', key: randomUUID(), status: 'READY',
      dueAt: new Date(Date.now() + policy.exportHours * 3600000),
      data: { executionId: id, format, filename, rowCount: rows?.length ?? 0 } satisfies Export,
    });
    await this.record(ownerId, 'export.created', row.id, { code, format, executionId: id });
    return this.present(row);
  }

  async download(ownerId: number, id: string) {
    const row = await this.owned(ownerId, 'EXPORT', id);
    if (row.status !== 'READY' || !row.dueAt || row.dueAt.getTime() <= Date.now()) throw new NotFoundError('Active export');
    const { format, filename, executionId } = row.data as unknown as Export;
    const result = await this.owned(ownerId, 'EXECUTION', executionId);
    const { code, scope, version, rows } = result.data as unknown as Execution;
    const table = [
      ['Report', platformReportCatalog[code].title],
      ['Source', platformReportCatalog[code].source, 'Definition', String(version)],
      ['From', scope.from, 'Through', scope.to, 'Company', scope.companyId ? String(scope.companyId) : 'All companies'],
      ['Period', 'Category', 'State', 'Count'],
      ...(rows ?? []).map(item => [item.period, item.category, item.state, String(item.count)]),
    ];
    const escape = (value: string) => '"' + (/^\s*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""') + '"';
    const bytes = format === 'PDF' ? this.renderer.pdf(table) : format === 'XLSX' ? this.renderer.xlsx(table)
      : Buffer.from('\uFEFF' + table.map(line => line.map(escape).join(',')).join('\r\n'));
    await this.record(ownerId, 'export.downloaded', id, { code, format });
    return { filename, bytes, format };
  }

  async saveTemplate(ownerId: number, input: Request & { title: string; previousId?: string }) {
    await this.validateScope(input);
    const previous = input.previousId ? await this.owned(ownerId, 'TEMPLATE', input.previousId) : null;
    const prior = previous?.data as unknown as Template | undefined;
    const { code, scope, title } = input;
    const template = { code, scope, title, version: (prior?.version ?? 0) + 1, rootId: prior?.rootId ?? randomUUID() };
    const row = await this.insertVersion({ ownerId, kind: 'TEMPLATE', status: 'PUBLISHED', key: template.rootId + ':' + template.version, data: template });
    await this.record(ownerId, 'template.published', row.id, { code, version: template.version });
    return this.present(row);
  }

  async createSchedule(ownerId: number, input: Omit<Schedule, 'lastExecutionId' | 'lastState'>) {
    const dueAt = nextReportDue(input.cadence, new Date());
    await this.validateScope({ code: input.code, scope: scheduledScope(input.cadence, dueAt, input.companyId, input.grouping) });
    const row = await this.records.create({ id: randomUUID(), ownerId, kind: 'SCHEDULE', key: randomUUID(), status: 'ACTIVE', data: input, dueAt });
    await this.record(ownerId, 'schedule.created', row.id, { code: input.code, cadence: input.cadence });
    return this.present(row);
  }

  async changeSchedule(ownerId: number, id: string, status: 'ACTIVE' | 'PAUSED') {
    const row = await this.owned(ownerId, 'SCHEDULE', id);
    if (status === row.status) return this.present(row);
    const cadence = (row.data as unknown as Schedule).cadence;
    const [changed] = await this.records.update({ status, dueAt: status === 'ACTIVE' ? nextReportDue(cadence, new Date()) : null }, {
      where: { id: row.id, status: row.status, updatedAt: row.updatedAt },
    });
    if (!changed) throw new ConflictError('The schedule has changed. Reload it before updating.');
    await this.record(ownerId, status === 'ACTIVE' ? 'schedule.resumed' : 'schedule.paused', id, {});
    return this.present(await row.reload());
  }

  async editSchedule(ownerId: number, id: string, input: Omit<Schedule, 'lastExecutionId' | 'lastState'>) {
    const row = await this.owned(ownerId, 'SCHEDULE', id);
    const dueAt = nextReportDue(input.cadence, new Date());
    await this.validateScope({ code: input.code, scope: scheduledScope(input.cadence, dueAt, input.companyId, input.grouping) });
    const { lastExecutionId, lastState } = row.data as unknown as Schedule;
    const [updated] = await this.records.update({
      dueAt: row.status === 'ACTIVE' ? dueAt : null, data: { ...input, lastExecutionId, lastState },
    }, { where: { id, status: row.status, updatedAt: row.updatedAt } });
    if (!updated) throw new ConflictError('The schedule has changed. Reload it before updating.');
    await this.record(ownerId, 'schedule.updated', id, { code: input.code, cadence: input.cadence });
    return this.present(await row.reload());
  }

  async tick(now = new Date()) {
    const records = await this.records.findAll({
      where: { kind: 'SCHEDULE', status: 'ACTIVE', dueAt: { [Op.lte]: now } },
      order: [['dueAt', 'ASC'], ['id', 'ASC']], limit: 10,
    });
    for (const row of records) {
      const dueAt = row.dueAt!;
      const condition = { id: row.id, dueAt, status: 'ACTIVE' };
      const schedule = row.data as unknown as Schedule;
      if (!(await this.activePlatformOwner(row.ownerId))) {
        await this.records.update({ status: 'PAUSED', dueAt: null, data: { ...schedule, lastState: 'ACCESS_REVOKED' } }, { where: condition });
        await this.record(row.ownerId, 'schedule.access-revoked', row.id, {});
        continue;
      }
      const scope = scheduledScope(schedule.cadence, dueAt, schedule.companyId, schedule.grouping);
      let lastState: string;
      let lastExecutionId: string | undefined;
      try {
        const run = await this.run(row.ownerId, { code: schedule.code, scope }, row.id + ':' + dueAt.toISOString(), row.id);
        if (run.status === 'QUEUED' || run.status === 'RUNNING') continue;
        lastState = run.status;
        lastExecutionId = run.id;
      } catch (error) {
        if (!(error instanceof BadRequestError || error instanceof NotFoundError)) throw error;
        lastState = 'INVALID_SCOPE';
        await this.record(row.ownerId, 'schedule.scope-invalid', row.id, { code: schedule.code });
      }
      await this.records.update({
        dueAt: nextReportDue(schedule.cadence, dueAt), data: { ...schedule, lastState, lastExecutionId },
      }, { where: condition });
    }
  }

  async policy() {
    const rows = await this.records.findAll({ where: { ownerId: 0, kind: 'POLICY' }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 25 });
    const current = rows.length ? (rows[0].data as unknown as Policy) : defaultReportPolicy;
    return { current: { version: current.version, maxDays: current.maxDays, exportHours: current.exportHours },
      history: rows.map(row => ({ id: row.id, createdAt: row.createdAt, ...row.data })) };
  }

  async publishPolicy(actor: number, expected: number, input: Omit<Policy, 'version'>, reason: string) {
    const { current } = await this.policy();
    if (expected !== current.version) throw new ConflictError('The policy has changed. Reload it before publishing.');
    const data = { ...input, version: current.version + 1, reason, actor };
    const row = await this.insertVersion({ ownerId: 0, kind: 'POLICY', status: 'PUBLISHED', key: 'version:' + data.version, data });
    await this.record(actor, 'policy.published', row.id, { version: data.version });
    return data;
  }

  private async insertVersion(input: { ownerId: number; kind: 'TEMPLATE' | 'POLICY'; status: string; key: string; data: object }) {
    try { return await this.records.create({ ...input, id: randomUUID() }); }
    catch (error) {
      if (error instanceof UniqueConstraintError) throw new ConflictError('A newer version already exists. Reload the list.');
      throw error;
    }
  }

  private record(actorUserId: number, action: string, entityId: string, after: Record<string, unknown>) {
    return this.audit.record({ actorUserId, companyId: null, action: 'platform.reports.' + action, entityType: 'platform_report', entityId, after });
  }
}

