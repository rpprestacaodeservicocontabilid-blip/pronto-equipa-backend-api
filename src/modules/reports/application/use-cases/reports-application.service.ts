import { ReportDataRow, ReportRecordView } from '../ports/report-source.port';
import { RecordQuery } from '../../../../shared/application/ports/record-store.port';
import { ReportFilters } from '../dto/report-filters';
export type { ReportFilters } from '../dto/report-filters';
import { ReportStorePort, ReportSourcePort, ReportRendererPort } from '../ports/report-source.port';
import { RecordStoreContext } from '../../../../shared/application/ports/record-store.port';
import { MembershipReaderPort } from '../../../tenancy/application/ports/membership-reader.port';

import { randomUUID } from 'crypto';

import { REPORT_CATALOG, REPORT_PERMISSION, ReportDefinition } from '../../domain/report-catalog';

export class ReportsApplicationService {
  constructor(
    private readonly audit: { record(input: any): Promise<void> },
    private readonly store: ReportStorePort,
    private readonly sources: ReportSourcePort,
    private readonly renderer: ReportRendererPort,
    private readonly membership: MembershipReaderPort,
  ) {}

  catalog() {
    return REPORT_CATALOG.map(({ code, name, description, domain, sensitive }) => ({
      code,
      name,
      description,
      domain,
      sensitive,
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
    return { id, code, status: 'COMPLETED', rowCount: data.length, generatedAt: createdAt, data };
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
      status: row.status,
      filename: row.payload.filename,
      rowCount: row.payload.rowCount,
      createdAt: row.createdAt,
    }));
  }
  async getExecution(companyId: number, actorUserId: number, id: string) {
    const row = await this.recordFindOne(companyId, {
      where: { id, companyId, ownerUserId: actorUserId, recordType: 'EXECUTION' },
    });
    if (!row) throw Object.assign(new Error('Execução não encontrada.'), { statusCode: 404 });
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'REPORT_RESULT_READ',
      entityType: 'REPORT_EXECUTION',
      entityId: id,
      after: { code: row.code },
    });
    return { id: row.id, code: row.code, status: row.status, ...row.payload };
  }
  async createExport(
    companyId: number,
    actorUserId: number,
    code: string,
    format: 'CSV' | 'XLSX' | 'PDF',
    filters: ReportFilters,
  ) {
    const result = await this.execute(companyId, actorUserId, code, filters);
    const rows = result.data;
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
        ? this.renderer.pdf(table)
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
        rowCount: result.rowCount,
        executionId: result.id,
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
      after: { code, format, rowCount: result.rowCount },
    });
    return { id: row.id, filename, rowCount: result.rowCount, status: 'READY' };
  }
  async downloadExport(companyId: number, actorUserId: number, id: string) {
    const row = await this.recordFindOne(companyId, {
      where: { id, companyId, ownerUserId: actorUserId, recordType: 'EXPORT', status: 'READY' },
    });
    if (!row) throw Object.assign(new Error('Exportação não encontrada.'), { statusCode: 404 });
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
  async dashboard(companyId: number, filters: ReportFilters) {
    const { active, employees, payroll } = await this.sources.dashboardData(companyId, filters);
    const gross = payroll.reduce((n, r: ReportDataRow) => n + Number(r.grossAmount || 0), 0);
    const net = payroll.reduce((n, r: ReportDataRow) => n + Number(r.netAmount || 0), 0);
    const costs = payroll.reduce(
      (n, r: ReportDataRow) => n + Number(r.employerCostsAmount || 0),
      0,
    );
    return {
      asOf: new Date().toISOString(),
      currency: 'AOA',
      workforce: { active, total: employees },
      payroll: {
        grossAmount: gross,
        netAmount: net,
        employerCostsAmount: costs,
        currency: payroll[0]?.currency || 'AOA',
        closedResults: payroll.length,
      },
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
    const definition = this.definition(String(row.code));
    const data = await this.sources.readSource(companyId, definition, filters);
    const fields = Array.isArray(row.payload.fields) ? (row.payload.fields as string[]) : [];
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
    return rows.map((row) => ({ id: row.id, status: row.status, ...row.payload }));
  }
  async publishCustomReport(companyId: number, actorUserId: number, id: string) {
    const row = await this.recordFindOne(companyId, {
      where: { id, companyId, recordType: 'CUSTOM_REPORT', ownerUserId: actorUserId },
    });
    if (!row)
      throw Object.assign(new Error('Relatório personalizado não encontrado.'), {
        statusCode: 404,
      });
    const payload = {
      ...row.payload,
      publishedAt: new Date().toISOString(),
      version: Number(row.payload.version || 1) + 1,
    };
    await this.withTenant(companyId, async (transaction) => {
      const current = await this.store.findOne({
        where: { id, companyId, recordType: 'CUSTOM_REPORT', ownerUserId: actorUserId },
        transaction,
      });
      if (current)
        await this.store.update(current, { status: 'PUBLISHED', payload }, { transaction });
    });
    return { id, status: row.status, ...row.payload };
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
    return fields[report.source] || [];
  }
  private toCsv(rows: ReportDataRow[]): string {
    if (!rows.length) return '\ufeff';
    const keys = Object.keys(rows[0]);
    const cell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
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
