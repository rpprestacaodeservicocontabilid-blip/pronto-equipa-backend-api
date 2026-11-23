import { Op, QueryTypes, Transaction, fn, col, where } from 'sequelize';
import { sequelize } from '../../../infra/database';
import { NotFoundError } from '../../../shared/errors/app.error';
import { CompanyModel } from '../../tenancy/infrastructure/persistence/models/company.model';

export const receiptTypes = [
  'REGULAR', 'OFF_CYCLE', 'SUPPLEMENTARY', 'RETROACTIVE', 'CORRECTION',
  'TERMINATION', 'DUPLICATE_COPY',
] as const;
export const receiptStatuses = [
  'PENDING', 'GENERATING', 'GENERATED', 'VALIDATED', 'PUBLISHED', 'SUPERSEDED',
  'GENERATION_FAILED', 'PUBLICATION_FAILED', 'ARCHIVED',
] as const;
export const batchStatuses = ['PENDING', 'STARTED', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED'] as const;
export const dateModes = ['day', 'month'] as const;

export interface Range { companyId?: number; from: string; to: string }
export interface Page { page: number; limit: number }
export interface VolumeFilter extends Range {
  type?: typeof receiptTypes[number];
  status?: typeof receiptStatuses[number];
  granularity: typeof dateModes[number];
}
interface Metric { category: string; status: string; total: number }
interface VolumeRow { period: string; type: string; status: string; total: number }
interface AuditCount { period: string; event: string; total: number }

const auditEvents = [
  'payslips.payslip.generated', 'payslips.payslip.generation-failed', 'payslips.payslip.published',
  'payslips.batch.created', 'payslips.policy.updated', 'payslips.template.created',
  'payslips.template.version-published', 'payslips.correction.created',
  'payslips.payslip.duplicate-issued', 'payslips.report.exported',
] as const;
const accessEvents = ['VIEW', 'PREVIEW', 'DOWNLOAD', 'PRINT', 'VERIFY'] as const;
const generated = ['GENERATED', 'VALIDATED', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED'];
const inRange = '"createdAt" >= :from AND "createdAt" < :to';
const scopedRange = '"companyId" = :companyId AND ' + inRange;
const ordering = 'ORDER BY "createdAt" DESC, id DESC';
const dayMs = 86400000;
const postgres = () => sequelize.getDialect() === 'postgres';
const jsonText = (field: string) => postgres()
  ? "data->>'" + field + "'"
  : "CAST(json_extract(data, '$." + field + "') AS TEXT)";
const period = (mode: 'day' | 'month') => postgres()
  ? "to_char(\"createdAt\" AT TIME ZONE 'Africa/Luanda', '" + (mode === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM') + "')"
  : "strftime('" + (mode === 'day' ? '%Y-%m-%d' : '%Y-%m') + "', \"createdAt\", '+1 hours')";
const total = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
};
const flag = (value: unknown) => value === 'true' || value === '1' ? true
  : value === 'false' || value === '0' ? false : null;
const safeEnum = (value: string, allowed: readonly string[]) => allowed.includes(value) ? value : 'OTHER';
// Model timestamps are stored in UTC. Raw SQLite comparisons use their canonical text order.
const utcTimestamp = (value: number) => new Date(value).toISOString().replace('T', ' ').replace('Z', ' +00:00');
const dayLimits = (range: Range) => ({
  from: utcTimestamp(Date.parse(range.from + 'T00:00:00+01:00')),
  to: utcTimestamp(Date.parse(range.to + 'T00:00:00+01:00') + dayMs),
});

async function readCompany(companyId: number) {
  const company = await CompanyModel.findByPk(companyId, { attributes: ['id', 'name'] });
  if (!company) throw new NotFoundError('Company');
  return { id: company.id, name: company.name };
}

export async function listPayslipCompanies(search: string | undefined, page: Page) {
  const matches = search ? where(fn('LOWER', col('name')), { [Op.like]: '%' + search.toLowerCase() + '%' }) : undefined;
  const { count, rows } = await CompanyModel.findAndCountAll({
    attributes: ['id', 'name'], where: matches, order: [['name', 'ASC'], ['id', 'ASC']],
    limit: page.limit, offset: (page.page - 1) * page.limit,
  });
  return { items: rows.map(row => ({ id: row.id, name: row.name })), total: count, page: page.page, limit: page.limit };
}

/** Payroll tables remain under their existing RLS policy. This reader only selects operational metadata. */
async function withCompany<T>(companyId: number, read: (tx: Transaction) => Promise<T>) {
  return sequelize.transaction(async tx => {
    if (postgres()) await sequelize.query("SELECT set_config('app.current_tenant', :tenant, true)", {
      replacements: { tenant: String(companyId) }, type: QueryTypes.SELECT, transaction: tx,
    });
    return read(tx);
  });
}
const query = <T extends object>(sql: string, replacements: Record<string, unknown>, transaction: Transaction) =>
  sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT, transaction });

async function forEachCompany(companyId: number | undefined, read: (company: { id: number; name: string }) => Promise<void>) {
  if (companyId !== undefined) {
    await read(await readCompany(companyId));
    return;
  }
  let after = 0;
  for (;;) {
    const companies = await CompanyModel.findAll({
      attributes: ['id', 'name'], where: { id: { [Op.gt]: after } }, order: [['id', 'ASC']], limit: 100,
    });
    for (const company of companies) await read({ id: company.id, name: company.name });
    if (companies.length < 100) return;
    after = companies[companies.length - 1].id;
  }
}

const metricGroup = (table: string, category: string, filter = '', field = 'status') =>
  "SELECT '" + category + "' AS category, " + field + " AS status, COUNT(*) AS total FROM "
    + table + ' WHERE ' + scopedRange + filter + ' GROUP BY ' + field;

function sum(rows: Iterable<Metric>, category: string, states?: readonly string[]) {
  let count = 0;
  for (const row of rows) if (row.category === category && (!states || states.includes(row.status))) count += row.total;
  return count;
}

export async function payslipOverview(range: Range) {
  const merged = new Map<string, Metric>();
  let companyCount = 0;
  const limits = dayLimits(range);
  const valid = jsonText('valid');
  const sql = [
    metricGroup('payslips', 'receipts'),
    metricGroup('payslip_batches', 'batches'),
    metricGroup('payslip_publications', 'publications'),
    metricGroup('payslip_documents', 'storage'),
    metricGroup('payslip_deliveries', 'portal', " AND " + jsonText('channel') + " = 'PORTAL'", jsonText('status')),
    metricGroup('payslip_outbox', 'delivery', " AND " + jsonText('eventType') + " = 'payslips.payslip.published'"),
    metricGroup('payslip_access_logs', 'integrity', " AND " + jsonText('action') + " = 'VERIFY'", valid),
  ].join(' UNION ALL ');
  const categories: Record<string, readonly string[]> = {
    receipts: receiptStatuses, batches: batchStatuses, publications: ['PUBLISHED'],
    storage: ['STORED'], portal: ['AVAILABLE'], delivery: ['PENDING', 'PUBLISHED', 'FAILED'],
    integrity: ['0', '1', 'true', 'false'],
  };
  await forEachCompany(range.companyId, async company => {
    const rows = await withCompany(company.id, tx => query<Metric>(sql, { companyId: company.id, ...limits }, tx));
    companyCount++;
    for (const row of rows) {
      let status = safeEnum(row.status, categories[row.category]);
      if (row.category === 'integrity' && status !== 'OTHER') status = flag(status) ? 'MATCH' : 'MISMATCH';
      const key = row.category + '/' + status;
      const prior = merged.get(key)?.total ?? 0;
      merged.set(key, { category: row.category, status, total: prior + total(row.total) });
    }
  });
  const metrics = [...merged.values()];
  return {
    range, companyCount,
    generated: sum(metrics, 'receipts', generated),
    published: sum(metrics, 'receipts', ['PUBLISHED']),
    pending: sum(metrics, 'receipts', ['PENDING', 'GENERATING']),
    failed: sum(metrics, 'receipts', ['GENERATION_FAILED', 'PUBLICATION_FAILED']),
    archived: sum(metrics, 'receipts', ['ARCHIVED']),
    metrics,
  };
}

export async function payslipVolume(filter: VolumeFilter): Promise<VolumeRow[]> {
  const day = period(filter.granularity);
  const type = jsonText('type');
  const merged = new Map<string, VolumeRow>();
  const sql = 'SELECT ' + day + ' AS period, ' + type + ' AS type, status, COUNT(*) AS total FROM payslips WHERE '
    + scopedRange + (filter.type ? ' AND ' + type + ' = :type' : '') + (filter.status ? ' AND status = :status' : '')
    + ' GROUP BY ' + day + ', ' + type + ', status';
  const limits = dayLimits(filter);
  await forEachCompany(filter.companyId, async company => {
    const rows = await withCompany(company.id, tx => query<VolumeRow>(sql, {
      companyId: company.id, ...limits, type: filter.type, status: filter.status,
    }, tx));
    for (const row of rows) {
      const state = safeEnum(row.status, receiptStatuses);
      const kind = safeEnum(row.type, receiptTypes);
      const key = row.period + '/' + kind + '/' + state;
      merged.set(key, { period: row.period, type: kind, status: state, total: (merged.get(key)?.total ?? 0) + total(row.total) });
    }
  });
  return [...merged.values()].sort((a, b) => b.period.localeCompare(a.period) || a.type.localeCompare(b.type) || a.status.localeCompare(b.status));
}

export async function payslipAudit(range: Range & { granularity: 'day' | 'month' }) {
  const day = period(range.granularity);
  const access = jsonText('action');
  const limits = dayLimits(range);
  const counts = new Map<string, AuditCount>();
  const sql = 'SELECT ' + day + ' AS period, action AS event, COUNT(*) AS total FROM audit_logs WHERE '
    + scopedRange + ' AND action IN (:events) GROUP BY ' + day + ', action'
    + ' UNION ALL SELECT ' + day + " AS period, 'access.' || " + access + ' AS event, COUNT(*) AS total FROM payslip_access_logs WHERE '
    + scopedRange + ' AND ' + access + ' IN (:access) GROUP BY ' + day + ', ' + access;
  await forEachCompany(range.companyId, async company => {
    const rows = await withCompany(company.id, tx => query<AuditCount>(sql, {
      companyId: company.id, ...limits, events: [...auditEvents], access: [...accessEvents],
    }, tx));
    for (const row of rows) {
      const key = row.period + '/' + row.event;
      counts.set(key, { period: row.period, event: row.event, total: (counts.get(key)?.total ?? 0) + total(row.total) });
    }
  });
  return [...counts.values()].sort((a, b) => b.period.localeCompare(a.period) || a.event.localeCompare(b.event));
}

type BatchRecord = { id: string; companyId: number; status: string; type: string; createdAt: string; updatedAt: string; total: string; completed: string; failed: string };
const batchFields = 'id, "companyId", status, "createdAt", "updatedAt", ' + jsonText('type') + ' AS type, '
  + jsonText('totalItems') + ' AS total, ' + jsonText('completedItems') + ' AS completed, ' + jsonText('failedItems') + ' AS failed';
function presentBatch(row: BatchRecord) {
  return {
    id: row.id, companyId: row.companyId, status: safeEnum(row.status, batchStatuses),
    type: safeEnum(row.type, receiptTypes), createdAt: row.createdAt, updatedAt: row.updatedAt,
    total: total(row.total), completed: total(row.completed), failed: total(row.failed),
  };
}

async function directory<T extends object, U>(
  companyId: number, table: string, fields: string, conditions: string, params: Record<string, unknown>,
  page: Page, present: (row: T) => U,
) {
  const company = await readCompany(companyId);
  const replacements = { ...params, companyId, limit: page.limit, offset: (page.page - 1) * page.limit };
  return withCompany(companyId, async tx => {
    const items = await query<T>('SELECT ' + fields + ' FROM ' + table + ' WHERE ' + conditions + ' '
      + ordering + ' LIMIT :limit OFFSET :offset', replacements, tx);
    const [count] = await query<{ total: number }>('SELECT COUNT(*) AS total FROM ' + table + ' WHERE ' + conditions, replacements, tx);
    return { company, items: items.map(present), total: total(count.total), page: page.page, limit: page.limit };
  });
}

export function payslipBatches(range: Range & Page & { companyId: number; status?: string; failures?: boolean }) {
  const failed = jsonText('failedItems');
  return directory(range.companyId, 'payslip_batches', batchFields,
    scopedRange + (range.status ? ' AND status = :status' : '') + (range.failures
      ? ' AND (CAST(' + failed + " AS INTEGER) > 0 OR status IN ('PARTIALLY_COMPLETED', 'FAILED'))" : ''),
    { ...dayLimits(range), status: range.status }, range, presentBatch);
}

export async function payslipBatch(companyId: number, id: string) {
  const company = await readCompany(companyId);
  return withCompany(companyId, async tx => {
    const [row] = await query<BatchRecord>('SELECT ' + batchFields + ' FROM payslip_batches WHERE "companyId" = :companyId AND id = :id', { companyId, id }, tx);
    if (!row) throw new NotFoundError('Payslip batch');
    const items = await query<{ status: string; total: number }>(
      'SELECT status, COUNT(*) AS total FROM payslip_batch_items WHERE "companyId" = :companyId AND "key" LIKE :prefix GROUP BY status',
      { companyId, prefix: id + ':%' }, tx,
    );
    return {
      company, ...presentBatch(row),
      progress: items.map(item => ({ status: safeEnum(item.status, ['PENDING', 'GENERATING', 'GENERATED', 'GENERATION_FAILED']), total: total(item.total) })),
    };
  });
}

interface TemplateRow { id: string; status: string; version: string | null; templateId: string | null; createdAt: string }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function payslipTemplates(companyId: number, page: Page) {
  return directory<TemplateRow, object>(companyId, 'payslip_template_versions',
    'id, status, "createdAt", ' + jsonText('version') + ' AS version, ' + jsonText('templateId') + ' AS "templateId"',
    '"companyId" = :companyId', {}, page, row => ({
      id: row.id, status: safeEnum(row.status, ['DRAFT', 'PUBLISHED', 'RETIRED']),
      createdAt: row.createdAt,
      templateId: row.templateId && uuid.test(row.templateId) ? row.templateId : null,
      version: row.version && /^v?\d{1,8}(\.\d{1,8}){0,3}$/i.test(row.version) ? row.version : null,
    }));
}

interface PolicyRow {
  id: string; status: string; createdAt: string; version: string; retentionDays: string | null;
  allowWorkerDownload: string | null; notifyWorkerOnPublish: string | null; requireManualPublication: string | null;
}
export function payslipPolicies(companyId: number, page: Page) {
  const fields = ['version', 'retentionDays', 'allowWorkerDownload', 'notifyWorkerOnPublish', 'requireManualPublication'];
  const policyFields = fields.map(field => jsonText(field) + ' AS "' + field + '"').join(', ');
  return directory<PolicyRow, object>(companyId, 'payslip_policies', 'id, status, "createdAt", ' + policyFields,
    '"companyId" = :companyId', {}, page, row => ({
      id: row.id, status: safeEnum(row.status, ['ACTIVE', 'SUPERSEDED']), createdAt: row.createdAt,
      version: total(row.version), retentionDays: row.retentionDays === null ? null : total(row.retentionDays),
      allowWorkerDownload: flag(row.allowWorkerDownload), notifyWorkerOnPublish: flag(row.notifyWorkerOnPublish),
      requireManualPublication: flag(row.requireManualPublication),
    }));
}

