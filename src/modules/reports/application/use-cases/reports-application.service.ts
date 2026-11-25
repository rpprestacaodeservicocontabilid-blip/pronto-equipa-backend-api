import { ReportDataRow, ReportRecordView } from '../ports/report-source.port';
import { RecordQuery } from '../../../../shared/application/ports/record-store.port';
import { ReportFilters } from '../dto/report-filters';
export type { ReportFilters } from '../dto/report-filters';
import { ReportStorePort, ReportSourcePort, ReportRendererPort } from '../ports/report-source.port';
import { RecordStoreContext } from '../../../../shared/application/ports/record-store.port';
import { MembershipReaderPort } from '../../../tenancy/application/ports/membership-reader.port';

import { randomUUID } from 'crypto';

import { REPORT_CATALOG, REPORT_PERMISSION, ReportDefinition, requiresSalaryAccess, WORKSPACE_REPORT_FILTERS } from '../../domain/report-catalog';
import { cents, money } from '../../../payroll/domain/payroll-result';

const exportLifetime = 24 * 60 * 60 * 1000;
const expiresAt = (row: ReportRecordView) => new Date(new Date(row.createdAt).getTime() + exportLifetime);

export class ReportsApplicationService {
  constructor(
    private readonly audit: { record(input: any): Promise<void> },
    private readonly store: ReportStorePort,
    private readonly sources: ReportSourcePort,
    private readonly renderer: ReportRendererPort,
    private readonly membership: MembershipReaderPort,
  ) {}

  async catalog(companyId: number, actor: number) {
    const grants = await this.membership.findPermissionNames(companyId, actor);
    return REPORT_CATALOG.filter(report => this.canRead(grants, report)).map(({ code, name, description, domain, sensitive, source }) => ({
      code,
      name,
      description,
      domain,
      sensitive,
      source,
      workspaceFilters: WORKSPACE_REPORT_FILTERS[code],
    }));
  }
  categories() {
    return [...new Set(REPORT_CATALOG.map((item) => item.domain))].map((code) => ({
      code,
      name: code.toUpperCase(),
      reports: REPORT_CATALOG.filter((item) => item.domain === code).length,
    }));
  }
  parameters(code: string) {
    const report = this.definition(code);
    return {
      code,
      filters: ['from', 'to', 'employeeId', 'departmentId', 'status', 'limit'],
      maxRows: 5000,
      defaultRows: 1000,
      sensitive: report.sensitive === true,
    };
  }
  definition(code: string): ReportDefinition {
    const value = REPORT_CATALOG.find((item) => item.code === code);
    if (!value) throw Object.assign(new Error('Relatório não encontrado.'), { statusCode: 404 });
    return value;
  }
  private canRead(grants: readonly string[], report: ReportDefinition) {
    return grants.includes(REPORT_PERMISSION[report.domain]) &&
      (!requiresSalaryAccess(report) || grants.includes('reports:salary:read-sensitive'));
  }
  private async assertReadable(companyId: number, actor: number, code: string | null) {
    const definition = this.definition(String(code));
    if (!this.canRead(await this.membership.findPermissionNames(companyId, actor), definition))
      throw Object.assign(new Error('Report access is no longer available.'), { statusCode: 403 });
    return definition;
  }
  customFields(code: string) {
    return this.allowedFields(this.definition(code));
  }

  private projectStoredRows(rows: ReportDataRow[]) {
    const restricted = new Set(['salaryAmount', 'calculationSnapshot', 'beneficiarySnapshot', 'accountCiphertext']);
    return rows.map(row => Object.fromEntries(Object.entries(row).filter(([name]) => !restricted.has(name))));
  }
  async execute(companyId: number, actorUserId: number, code: string, filters: ReportFilters) {
    const definition = this.definition(code);
    const data = await this.sources.readSource(companyId, definition, filters);
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const payload = {
      filters,
      rowCount: data.length,
      data,
      generatedAt: createdAt,
      definitionVersion: 1,
    };
    await this.recordCreate(companyId, {
      id,
      companyId,
      recordType: 'EXECUTION',
      status: 'COMPLETED',
      ownerUserId: actorUserId,
      code,
      payload,
      createdAt: new Date(createdAt),
      updatedAt: new Date(createdAt),
    });
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'REPORT_EXECUTED',
      entityType: 'REPORT_EXECUTION',
      entityId: id,
      after: { code, rowCount: data.length, filters },
    });
    return { id, code, status: 'COMPLETED', ...payload };
  }
  async listExecutions(companyId: number, actorUserId: number, limit = 30) {
    const rows = await this.recordFindAll(companyId, {
      where: { companyId, recordType: 'EXECUTION', ownerUserId: actorUserId },
      order: [['createdAt', 'DESC']],
      limit: Math.min(limit, 100),
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      status: row.status,
      rowCount: row.payload.rowCount,
      generatedAt: row.createdAt,
    }));
  }
  async listExports(companyId: number, actorUserId: number, limit = 30) {
    const rows = await this.recordFindAll(companyId, {
      where: { companyId, recordType: 'EXPORT', ownerUserId: actorUserId },
      order: [['createdAt', 'DESC']],
      limit: Math.min(limit, 100),
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      status: expiresAt(row).getTime() <= Date.now() ? 'EXPIRED' : row.status,
      filename: row.payload.filename,
      rowCount: row.payload.rowCount,
      createdAt: row.createdAt,
      expiresAt: expiresAt(row),
    }));
  }
  async getExecution(companyId: number, actorUserId: number, id: string) {
    const row = await this.recordFindOne(companyId, {
      where: { id, companyId, ownerUserId: actorUserId, recordType: 'EXECUTION' },
    });
    if (!row) throw Object.assign(new Error('Execução não encontrada.'), { statusCode: 404 });
    await this.assertReadable(companyId, actorUserId, row.code);
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'REPORT_RESULT_READ',
      entityType: 'REPORT_EXECUTION',
      entityId: id,
      after: { code: row.code },
    });
    const data = Array.isArray(row.payload.data) ? this.projectStoredRows(row.payload.data as ReportDataRow[]) : [];
    return { id: row.id, code: row.code, status: row.status, ...row.payload, data };
  }
  async createExport(
    companyId: number,
    actorUserId: number,
    code: string,
    format: 'CSV' | 'XLSX' | 'PDF',
    filters: ReportFilters,
  ) {
    const result = await this.execute(companyId, actorUserId, code, filters);
    return this.renderExport(companyId, actorUserId, code, format, result.id, result.data);
  }
  async exportExecution(companyId: number, actorUserId: number, id: string, format: 'CSV' | 'XLSX' | 'PDF') {
    const result = await this.getExecution(companyId, actorUserId, id);
    return this.renderExport(companyId, actorUserId, String(result.code), format, id, result.data);
  }
  private async renderExport(companyId: number, actorUserId: number, code: string,
    format: 'CSV' | 'XLSX' | 'PDF', executionId: string, rows: ReportDataRow[]) {
    const keys = rows.length ? Object.keys(rows[0]) : [];
    const table = [
      keys,
      ...rows.map((row) =>
        keys.map((key) =>
          typeof row[key] === 'object' ? JSON.stringify(row[key] ?? '') : String(row[key] ?? ''),
        ),
      ),
    ];
    const content =
      format === 'PDF'
        ? this.renderer.pdf(keys.length ? table : [['No records']])
        : format === 'XLSX'
          ? this.renderer.xlsx(table)
          : Buffer.from(this.toCsv(rows));
    const filename = `${code.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.${format.toLowerCase()}`;
    const createdAt = new Date();
    const row = await this.recordCreate(companyId, {
      id: randomUUID(),
      companyId,
      recordType: 'EXPORT',
      status: 'READY',
      ownerUserId: actorUserId,
      code,
      payload: {
        filename,
        format,
        content: content.toString('base64'),
        rowCount: rows.length,
        executionId,
        projectionVersion: 2,
      },
      createdAt,
      updatedAt: createdAt,
    });
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'REPORT_EXPORTED',
      entityType: 'REPORT_EXPORT',
      entityId: row.id,
      after: { code, format, rowCount: rows.length, executionId },
    });
    return { id: row.id, filename, rowCount: rows.length, status: 'READY', expiresAt: expiresAt(row) };
  }
  async downloadExport(companyId: number, actorUserId: number, id: string) {
    const row = await this.recordFindOne(companyId, {
      where: { id, companyId, ownerUserId: actorUserId, recordType: 'EXPORT', status: 'READY' },
    });
    if (!row) throw Object.assign(new Error('Exportação não encontrada.'), { statusCode: 404 });
    const definition = await this.assertReadable(companyId, actorUserId, row.code);
    if (expiresAt(row).getTime() <= Date.now() || (row.payload.projectionVersion !== 2 && definition.domain === 'contracts'))
      throw Object.assign(new Error('Esta exportação expirou. Gere um novo ficheiro.'), { statusCode: 410 });
    const content = String(row.payload.content || '');
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'REPORT_EXPORT_DOWNLOADED',
      entityType: 'REPORT_EXPORT',
      entityId: id,
      after: { code: row.code },
    });
    return {
      filename: String(row.payload.filename),
      format: String(row.payload.format || 'CSV'),
      content: Buffer.from(content, 'base64'),
    };
  }
  async dashboardFor(companyId: number, actor: number, filters: ReportFilters) {
    const grants = await this.membership.findPermissionNames(companyId, actor);
    return this.dashboard(companyId, filters, this.canRead(grants, this.definition('RPT-PAY-002')));
  }
  async dashboard(companyId: number, filters: ReportFilters, includePayroll = true) {
    const { active, employees, payroll } = await this.sources.dashboardData(companyId, filters, includePayroll);
    const totals = payroll.map(row => ({
      grossAmount: money(cents(String(row.grossAmount ?? '0'))),
      netAmount: money(cents(String(row.netAmount ?? '0'))),
      employerCostsAmount: money(cents(String(row.employerCostsAmount ?? '0'))),
      personnelCost: money(cents(String(row.grossAmount ?? '0')) + cents(String(row.employerCostsAmount ?? '0'))),
      currency: String(row.currency || 'AOA'),
      closedResults: Number(row.resultCount ?? 1),
    }));
    const legacy = totals.find(row => row.currency === 'AOA') ?? totals[0];
    return {
      asOf: new Date().toISOString(),
      currency: 'AOA',
      workforce: { active, total: employees },
      payroll: includePayroll ? {
        grossAmount: Number(legacy?.grossAmount ?? 0),
        netAmount: Number(legacy?.netAmount ?? 0),
        employerCostsAmount: Number(legacy?.employerCostsAmount ?? 0),
        currency: legacy?.currency ?? 'AOA',
        closedResults: legacy?.closedResults ?? 0,
      } : null,
      payrollByCurrency: includePayroll ? totals : [],
      formulas: {
        personnelCost: 'grossAmount + employerCostsAmount',
        source: 'closed payroll results only',
      },
    };
  }
  async saveCustomReport(
    companyId: number,
    actorUserId: number,
    input: { name: string; code: string; fields: string[]; filters?: Record<string, unknown> },
  ) {
    const definition = this.definition(input.code);
    const allowed = this.allowedFields(definition);
    if (!input.fields.length || input.fields.some((field) => !allowed.includes(field)))
      throw Object.assign(new Error('O relatório contém campos não permitidos.'), {
        statusCode: 400,
      });
    const createdAt = new Date();
    const record = await this.recordCreate(companyId, {
      id: randomUUID(),
      companyId,
      recordType: 'CUSTOM_REPORT',
      status: 'DRAFT',
      ownerUserId: actorUserId,
      code: input.code,
      payload: { name: input.name, fields: input.fields, filters: input.filters || {}, version: 1 },
      createdAt,
      updatedAt: createdAt,
    });
    return { id: record.id, ...record.payload, status: record.status };
  }
  async previewCustomReport(
    companyId: number,
    actorUserId: number,
    id: string,
    filters: ReportFilters,
  ) {
    const row = await this.recordFindOne(companyId, {
      where: { id, companyId, recordType: 'CUSTOM_REPORT', ownerUserId: actorUserId },
    });
    if (!row)
      throw Object.assign(new Error('Relatório personalizado não encontrado.'), {
        statusCode: 404,
      });
    const definition = await this.assertReadable(companyId, actorUserId, row.code);
    const data = await this.sources.readSource(companyId, definition, { ...row.payload.filters as ReportFilters, ...filters });
    const fields = Array.isArray(row.payload.fields) ? (row.payload.fields as string[]) : [];
    await this.audit.record({
      companyId, actorUserId, action: 'REPORT_CUSTOM_PREVIEWED', entityType: 'REPORT_CUSTOM', entityId: id,
      after: { code: row.code, rowCount: data.length },
    });
    return {
      id,
      code: row.code,
      version: row.payload.version,
      rowCount: data.length,
      data: data.map((item) => Object.fromEntries(fields.map((field) => [field, item[field]]))),
    };
  }
  async listCustomReports(companyId: number, actorUserId: number) {
    const rows = await this.recordFindAll(companyId, {
      where: { companyId, recordType: 'CUSTOM_REPORT', ownerUserId: actorUserId },
      order: [['updatedAt', 'DESC']],
    });
    return rows.map((row) => ({ id: row.id, code: row.code, status: row.status, ...row.payload }));
  }
  async publishCustomReport(companyId: number, actorUserId: number, id: string) {
    const row = await this.recordFindOne(companyId, {
      where: { id, companyId, recordType: 'CUSTOM_REPORT', ownerUserId: actorUserId },
    });
    if (!row)
      throw Object.assign(new Error('Relatório personalizado não encontrado.'), {
        statusCode: 404,
      });
    await this.assertReadable(companyId, actorUserId, row.code);
    return this.withTenant(companyId, async (transaction) => {
      const current = await this.store.findOne({
        where: { id, companyId, recordType: 'CUSTOM_REPORT', ownerUserId: actorUserId },
        transaction, forUpdate: true,
      });
      if (!current) throw Object.assign(new Error('Relatório personalizado não encontrado.'), { statusCode: 404 });
      const payload = current.status === 'PUBLISHED' ? current.payload : {
        ...current.payload, publishedAt: new Date().toISOString(), version: Number(current.payload.version || 1) + 1,
      };
      if (current.status !== 'PUBLISHED') await this.store.update(current, { status: 'PUBLISHED', payload }, { transaction });
      return { id, code: current.code, status: 'PUBLISHED', ...payload };
    });
  }
  async createSchedule(
    companyId: number,
    actorUserId: number,
    input: {
      code: string;
      cron: string;
      timezone: string;
      format: 'CSV' | 'XLSX' | 'PDF';
      filters?: ReportFilters;
      recipients?: number[];
    },
  ) {
    const definition = this.definition(input.code);
    if (!/^(\S+\s+){4}\S+$/.test(input.cron))
      throw Object.assign(new Error('Expressão cron inválida.'), { statusCode: 400 });
    try {
      Intl.DateTimeFormat('en-US', { timeZone: input.timezone });
    } catch {
      throw Object.assign(new Error('Fuso horário inválido.'), { statusCode: 400 });
    }
    const reader = this.membership;
    for (const recipient of input.recipients || []) {
      const [membership, permissions] = await Promise.all([
        reader.findMembership(companyId, recipient),
        reader.findPermissionNames(companyId, recipient),
      ]);
      const permission = REPORT_PERMISSION[definition.domain];
      if (
        !membership ||
        membership.memberStatus !== 'ACTIVE' ||
        membership.companyStatus !== 'ACTIVE' ||
        !permissions.includes(permission) ||
        ((definition.domain === 'payroll' || definition.domain === 'tax') &&
          (!permissions.includes('reports:salary:read') ||
            !permissions.includes('reports:salary:read-sensitive')))
      )
        throw Object.assign(new Error('Recipient is not authorized for this report.'), {
          statusCode: 403,
        });
    }
    const createdAt = new Date();
    const row = await this.recordCreate(companyId, {
      id: randomUUID(),
      companyId,
      recordType: 'SCHEDULE',
      status: 'ACTIVE',
      ownerUserId: actorUserId,
      code: input.code,
      payload: { ...input, recipients: input.recipients || [], createdBy: actorUserId },
      createdAt,
      updatedAt: createdAt,
    });
    return { id: row.id, status: row.status, ...row.payload };
  }
  async schedules(companyId: number, actorUserId: number) {
    const rows = await this.recordFindAll(companyId, {
      where: { companyId, recordType: 'SCHEDULE', ownerUserId: actorUserId },
      order: [['createdAt', 'DESC']],
    });
    return rows.map((row) => ({ id: row.id, status: row.status, ...row.payload }));
  }
  async updateSchedule(
    companyId: number,
    actorUserId: number,
    id: string,
    action: 'pause' | 'resume',
  ) {
    const row = await this.recordFindOne(companyId, {
      where: { companyId, id, recordType: 'SCHEDULE', ownerUserId: actorUserId },
    });
    if (!row) throw Object.assign(new Error('Agendamento não encontrado.'), { statusCode: 404 });
    const status = action === 'pause' ? 'PAUSED' : 'ACTIVE';
    await this.withTenant(companyId, async (transaction) => {
      const current = await this.store.findOne({
        where: { companyId, id, recordType: 'SCHEDULE', ownerUserId: actorUserId },
        transaction,
      });
      if (current) await this.store.update(current, { status }, { transaction });
    });
    return { id, status, ...row.payload };
  }

  private recordCreate(companyId: number, values: ReportRecordView) {
    return this.withTenant(companyId, (transaction) => this.store.create(values, { transaction }));
  }
  private recordFindAll(companyId: number, options: RecordQuery) {
    return this.withTenant(companyId, (transaction) =>
      this.store.findAll({ ...options, transaction }),
    );
  }
  private recordFindOne(companyId: number, options: RecordQuery) {
    return this.withTenant(companyId, (transaction) =>
      this.store.findOne({ ...options, transaction }),
    );
  }

  private withTenant<T>(
    companyId: number,
    fn: (transaction: RecordStoreContext) => Promise<T>,
  ): Promise<T> {
    return this.store.transaction(companyId, fn);
  }
  private allowedFields(report: ReportDefinition): string[] {
    const fields: Record<string, string[]> = {
      employees: [
        'employeeNumber',
        'firstName',
        'lastName',
        'admissionDate',
        'terminationDate',
        'departmentId',
        'jobTitle',
        'jobCategory',
        'status',
      ],
      contracts: [
        'employeeId',
        'contractNumber',
        'typeCode',
        'status',
        'startDate',
        'endDate',
        'currency',
      ],
      attendance: ['employeeId', 'punchType', 'occurredAt', 'workDate', 'source'],
      leave: ['employeeId', 'leaveType', 'status', 'requestedDays', 'startDate', 'endDate'],
      payroll: [
        'runId',
        'employeeId',
        'grossAmount',
        'deductionsAmount',
        'netAmount',
        'employerCostsAmount',
        'currency',
      ],
      payments: [
        'employeeId',
        'amount',
        'currency',
        'paymentType',
        'method',
        'status',
        'createdAt',
      ],
      loans: ['employeeId', 'loanNumber', 'principalAmount', 'currency', 'status'],
      payslips: ['employeeId', 'status', 'createdAt'],
    };
    if (report.code === 'RPT-TAX-001') return ['runId', 'employeeId', 'irt', 'legalRuleSetVersion', 'currency'];
    if (report.code === 'RPT-TAX-003') return ['runId', 'employeeId', 'employeeInss', 'employerInss', 'legalRuleSetVersion', 'currency'];
    return fields[report.source] || [];
  }
  private toCsv(rows: ReportDataRow[]): string {
    if (!rows.length) return '\ufeff';
    const keys = Object.keys(rows[0]);
    const cell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^(?:\s*[=+@-]|[\t\r\n])/.test(text)) text = "'" + text;
      return `"${text.replace(/"/g, '""')}"`;
    };
    return (
      '\ufeff' +
      [
        keys.map(cell).join(';'),
        ...rows.map((row) =>
          keys
            .map((key) => cell(typeof row[key] === 'object' ? JSON.stringify(row[key]) : row[key]))
            .join(';'),
        ),
      ].join('\r\n')
    );
  }
}
