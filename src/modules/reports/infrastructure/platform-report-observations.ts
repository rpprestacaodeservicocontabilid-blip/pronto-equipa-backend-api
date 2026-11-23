import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../../infra/database';
import { NotFoundError } from '../../../shared/errors/app.error';
import { CompanyModel } from '../../tenancy/infrastructure/persistence/models/company.model';
import { AuditLogModel } from '../../audit/infrastructure/persistence/models/audit-log.model';
import { listPayslipCompanies, payslipVolume } from '../../payslips/infrastructure/platform-payslips.reader';
import { REPORT_CATALOG } from '../domain/report-catalog';
import { Observation, PlatformReportCode, ReportScope } from '../domain/platform-report-catalog';

const reportKinds = ['EXECUTION', 'EXPORT', 'CUSTOM_REPORT', 'SCHEDULE'];
const statuses = ['COMPLETED', 'FAILED', 'READY', 'PENDING', 'QUEUED', 'RUNNING', 'CANCELLED', 'EXPIRED', 'DRAFT', 'PUBLISHED', 'ACTIVE', 'PAUSED'];
const domainForCode = new Map(REPORT_CATALOG.map(item => [item.code, item.domain.toUpperCase()]));
const workflowEvents = {
  PAYROLL_ACTIVITY: [
    'payroll.period.created', 'payroll.run.created', 'payroll.run.cancelled',
    'payroll.run.validation-requested', 'payroll.run.approval-recorded', 'payroll.correction.created',
    'payroll.payment-instructions.prepared', 'payroll.export.requested',
  ],
  PAYMENT_ACTIVITY: [
    'payments.batch.created', 'payments.batch.validated', 'payments.batch.submitted', 'payments.batch.executed',
    'payments.batch.rejected', 'payments.order.submitted', 'payments.order.failed',
    'payments.transaction.returned', 'payments.reconciliation.started', 'payments.reconciliation.resolved',
  ],
};

const postgres = () => sequelize.getDialect() === 'postgres';
const day = 86400000;
const utcTimestamp = (value: number) => new Date(value).toISOString().replace('T', ' ').replace('Z', ' +00:00');
const dateLimits = (scope: ReportScope) => ({
  from: utcTimestamp(Date.parse(scope.from + 'T00:00:00+01:00')),
  to: utcTimestamp(Date.parse(scope.to + 'T00:00:00+01:00') + day),
});
const calendarPeriod = (grouping: ReportScope['grouping']) => postgres()
  ? 'to_char("createdAt" AT TIME ZONE \'Africa/Luanda\', \'' + (grouping === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM') + '\')'
  : 'strftime(\'' + (grouping === 'day' ? '%Y-%m-%d' : '%Y-%m') + '\', "createdAt", \'+1 hours\')';

function combine(rows: Observation[]) {
  const results = new Map<string, Observation>();
  for (const row of rows) {
    const key = [row.period, row.category, row.state].join('/');
    results.set(key, { ...row, count: Number(row.count) + (results.get(key)?.count ?? 0) });
  }
  return [...results.values()].sort((a, b) => b.period.localeCompare(a.period)
    || a.category.localeCompare(b.category) || a.state.localeCompare(b.state));
}

async function forCompanies(companyId: number | undefined, read: (id: number) => Promise<void>) {
  if (companyId !== undefined) { await read(companyId); return; }
  let after = 0;
  for (;;) {
    const rows = await CompanyModel.findAll({ attributes: ['id'], where: { id: { [Op.gt]: after } }, order: [['id', 'ASC']], limit: 100 });
    for (const row of rows) await read(row.id);
    if (rows.length < 100) return;
    after = rows[rows.length - 1].id;
  }
}

export class PlatformReportObservations {
  constructor(private readonly onboardingDaily: (from: string, to: string) => Promise<{ label: string; count: number }[]>) {}
  companies = listPayslipCompanies;

  async audit(ownerId: number, page: number, limit: number) {
    const { rows, count } = await AuditLogModel.findAndCountAll({
      attributes: ['id', 'action', 'entityId', 'createdAt'],
      where: { actorUserId: ownerId, companyId: null, action: { [Op.like]: 'platform.reports.%' } },
      order: [['createdAt', 'DESC'], ['id', 'DESC']], limit, offset: (page - 1) * limit,
    });
    return { items: rows.map(row => ({ id: row.id, action: row.action, reference: row.entityId, createdAt: row.createdAt })), page, limit, total: count };
  }

  async checkCompany(id: number) {
    if (!(await CompanyModel.findByPk(id, { attributes: ['id'] }))) throw new NotFoundError('Company');
  }

  async read(code: PlatformReportCode, scope: ReportScope): Promise<Observation[]> {
    if (code === 'ONBOARDING_ACTIVITY') {
      const rows = await this.onboardingDaily(scope.from, scope.to);
      return combine(rows.map(item => ({
        period: scope.grouping === 'day' ? item.label : item.label.slice(0, 7),
        category: 'APPLICATION', state: 'REGISTERED', count: item.count,
      })));
    }
    if (code === 'PAYSLIP_ACTIVITY') {
      const rows = await payslipVolume({ companyId: scope.companyId, from: scope.from, to: scope.to, granularity: scope.grouping });
      return rows.map(item => ({ period: item.period, category: item.type, state: item.status, count: item.total }));
    }

    const period = calendarPeriod(scope.grouping);
    const selected = ' WHERE "companyId" = :id AND "createdAt" >= :from AND "createdAt" < :to';
    let sql: string;
    let events: string[] = [];
    if (code === 'REPORT_ACTIVITY') {
      sql = 'SELECT ' + period + ' AS period, "recordType" AS category, status AS state, COUNT(*) AS count FROM report_records'
        + selected + ' AND "recordType" IN (:events) GROUP BY ' + period + ', "recordType", status';
      events = reportKinds;
    } else if (code === 'DOMAIN_USAGE') {
      sql = 'SELECT ' + period + " AS period, code AS category, status AS state, COUNT(*) AS count FROM report_records"
        + selected + " AND \"recordType\" = 'EXECUTION' AND code IN (:events) GROUP BY " + period + ', code, status';
      events = [...domainForCode.keys()];
    } else {
      events = workflowEvents[code];
      sql = 'SELECT ' + period + " AS period, action AS category, 'RECORDED' AS state, COUNT(*) AS count FROM audit_logs"
        + selected + ' AND action IN (:events) GROUP BY ' + period + ', action';
    }
    const totals: Observation[] = [];
    const dates = dateLimits(scope);
    await forCompanies(scope.companyId, async id => {
      const observations = await sequelize.transaction(async transaction => {
        if (postgres()) await sequelize.query("SELECT set_config('app.current_tenant', :tenant, true)", {
          replacements: { tenant: String(id) }, type: QueryTypes.SELECT, transaction,
        });
        return sequelize.query<Observation>(sql, { replacements: { id, ...dates, events }, transaction, type: QueryTypes.SELECT });
      });
      const sanitized = observations.map(item => ({
        period: item.period,
        category: code === 'DOMAIN_USAGE' ? domainForCode.get(item.category) ?? 'OTHER' : item.category,
        state: item.state === 'RECORDED' || statuses.includes(item.state) ? item.state : 'OTHER',
        count: Number(item.count),
      }));
      totals.push(...sanitized);
      // Merge incrementally so a platform-wide query does not retain one copy per company.
      if (totals.length > 10000) totals.splice(0, totals.length, ...combine(totals));
    });
    return combine(totals);
  }
}

