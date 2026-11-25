import { PayslipPersistencePort, PayslipSourcesPort } from '../ports/payslip-persistence.port';
import {
  PayslipDocumentStorage,
  PayslipRendererPort,
  PayslipReportRendererPort,
} from '../ports/payslip-output.port';
import {
  RecordStoreContext,
  RecordFilter as Op,
} from '../../../../shared/application/ports/record-store.port';
import type { PayslipType, PayslipLine, PayslipSnapshot } from '../../domain/payslips.contracts';
export type {
  PayslipStatus,
  PayslipType,
  PayslipLine,
  PayslipSnapshot,
} from '../../domain/payslips.contracts';
import { createHash, randomBytes, randomUUID } from 'crypto';

import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../../shared/errors/app.error';

import { hash, cents, validateCalculation } from '../../../payroll/domain/payroll-result';

type RecordData = Record<string, any>;
const now = () => new Date().toISOString();
const rec = (model: any) =>
  model as {
    id: string;
    companyId: number;
    status: string;
    runId: string | null;
    employeeId: string | null;
    key: string;
    data: RecordData;
  };

export class PayslipsApplicationService {
  private batchEnqueuer?: (
    companyId: number,
    actorUserId: number,
    batchId: string,
  ) => Promise<void>;
  constructor(
    private readonly audit: AuditRecorderPort,
    private readonly storage: PayslipDocumentStorage,
    private readonly renderer: PayslipRendererPort,
    private readonly persistence: PayslipPersistencePort,
    private readonly sources: PayslipSourcesPort,
    private readonly reportRenderer: PayslipReportRendererPort,
  ) {}

  setBatchEnqueuer(
    enqueue: (companyId: number, actorUserId: number, batchId: string) => Promise<void>,
  ) {
    this.batchEnqueuer = enqueue;
  }
  private present(data: RecordData) {
    const {
      documentStorageKey,
      verificationCodeHash,
      verificationCode,
      templateSnapshot,
      ...publicData
    } = data;
    return publicData;
  }

  private tenant<T>(
    companyId: number,
    operation: (transaction: RecordStoreContext) => Promise<T>,
  ): Promise<T> {
    return this.persistence.collections.payslip.transaction(companyId, operation);
  }
  private async findPayslip(companyId: number, id: string, transaction?: RecordStoreContext) {
    const row = await this.persistence.collections.payslip.findOne({
      where: { companyId, id },
      ...(transaction ? { transaction } : {}),
    });
    if (!row) throw new NotFoundError('Payslip');
    return rec(row);
  }
  private async findTemplateVersion(
    companyId: number,
    id: string,
    transaction?: RecordStoreContext,
  ) {
    const row = await this.persistence.collections.payslipTemplateVersion.findOne({
      where: { companyId, id },
      ...(transaction ? { transaction } : {}),
    });
    if (!row) throw new NotFoundError('Payslip template version');
    return rec(row);
  }

  async list(
    companyId: number,
    query: { page: number; limit: number; status?: string; employeeId?: string; type?: string },
  ) {
    return this.tenant(companyId, async (transaction) => {
      const where = {
        companyId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.type ? { 'data.type': query.type } : {}),
      };
      const [rows, total] = await Promise.all([
        this.persistence.collections.payslip.findAll({
          where,
          order: [['createdAt', 'DESC'], ['id', 'DESC']],
          limit: query.limit,
          offset: (query.page - 1) * query.limit,
          transaction,
        }),
        this.persistence.collections.payslip.count({ where, transaction }),
      ]);
      return {
        page: query.page,
        limit: query.limit,
        total,
        data: rows.map(rec).map((row) => this.present(row.data)),
      };
    });
  }

  async issuanceRuns(companyId: number, page: number) {
    return this.tenant(companyId, async transaction => {
      const limit = 25;
      const rows = await this.sources.runs.findAll({
        where: { companyId, status: 'CLOSED', runType: { [Op.ne]: 'SIMULATION' } },
        order: [['createdAt', 'DESC'], ['id', 'DESC']], offset: (page - 1) * limit, limit: limit + 1, transaction,
      });
      const runs = rows.slice(0, limit);
      const periods = runs.length ? await this.sources.periods.findAll({
        where: { companyId, id: { [Op.in]: [...new Set(runs.map(run => run.periodId))] } }, transaction,
      }) : [];
      const byId = new Map(periods.map(period => [period.id, { startDate: period.startDate, endDate: period.endDate }]));
      return { more: rows.length > limit, items: runs.map(run => ({
        id: run.id, runType: run.runType, originalRunId: run.originalRunId, period: byId.get(run.periodId),
      })) };
    });
  }

  async issuanceResults(companyId: number, runId: string, page: number, employeeId?: string) {
    return this.tenant(companyId, async transaction => {
      const run = await this.sources.runs.findOne({
        where: { companyId, id: runId, status: 'CLOSED', runType: { [Op.ne]: 'SIMULATION' } }, transaction,
      });
      if (!run) throw new NotFoundError('Closed payroll run');
      const limit = 50;
      const rows = await this.sources.results.findAll({
        where: { companyId, runId, ...(employeeId ? { employeeId } : {}) },
        order: [['employeeId', 'ASC'], ['id', 'ASC']], offset: (page - 1) * limit, limit: limit + 1, transaction,
      });
      const keys = rows.slice(0, limit);
      const employees = keys.length ? await this.sources.employees.findAll({
        where: { companyId, id: { [Op.in]: keys.map(row => row.employeeId) } }, transaction,
      }) : [];
      const people = new Map(employees.map(person => [person.id, person]));
      return { more: rows.length > limit, items: keys.map(row => {
        const person = people.get(row.employeeId);
        return { id: row.id, employeeId: row.employeeId, name: person
          ? (person.firstName + ' ' + person.lastName).trim() : null, employeeCode: person?.employeeNumber ?? null };
      }) };
    });
  }

  async issuanceTemplates(companyId: number) {
    return this.tenant(companyId, async transaction => {
      const versions = await this.persistence.collections.payslipTemplateVersion.findAll({
        where: { companyId, status: 'PUBLISHED' }, order: [['createdAt', 'DESC']], limit: 100, transaction,
      });
      const ids = [...new Set(versions.map(row => row.employeeId).filter(Boolean))];
      const templates = ids.length ? await this.persistence.collections.payslipTemplate.findAll({
        where: { companyId, id: { [Op.in]: ids } }, transaction,
      }) : [];
      const names = new Map(templates.map(row => [row.id, row.data.name]));
      return versions.map(row => ({ id: row.id, version: String(row.data.version),
        name: names.get(String(row.employeeId)) ?? 'Payslip template' }));
    });
  }

  async generate(
    companyId: number,
    actorUserId: number,
    input: {
      payrollRunId: string;
      payrollResultId: string;
      employeeId: string;
      templateVersionId: string;
      type?: PayslipType;
      idempotencyKey?: string;
    },
  ) {
    const created = await this.tenant(companyId, async (transaction) => {
      const run = await this.sources.runs.findOne({
        where: { companyId, id: input.payrollRunId },
        transaction,
      });
      if (!run || run.status !== 'CLOSED' || run.runType === 'SIMULATION')
        throw new ConflictError('A payslip requires a closed, non-simulation payroll run.');
      if (run.runType !== (input.type ?? 'REGULAR'))
        throw new ConflictError('The receipt type must match the closed payroll run.');
      const result = await this.sources.results.findOne({
        where: {
          companyId,
          id: input.payrollResultId,
          runId: input.payrollRunId,
          employeeId: input.employeeId,
        },
        transaction,
      });
      if (!result) throw new NotFoundError('Closed payroll result');
      const template = await this.findTemplateVersion(
        companyId,
        input.templateVersionId,
        transaction,
      );
      if (template.status !== 'PUBLISHED')
        throw new ConflictError('Publish the template version before issuing payslips.');
      const emissionKey = `${input.payrollResultId}:${input.type ?? 'REGULAR'}`;
      const existing = await this.persistence.collections.payslip.findOne({
        where: { companyId, key: emissionKey },
        transaction,
      });
      if (existing) {
        const previous = rec(existing);
        if (previous.data.templateVersionId !== input.templateVersionId)
          throw new ConflictError(
            'This payroll result already has a payslip. Use a correction run or issue a duplicate copy.',
          );
        if (previous.status !== 'GENERATION_FAILED') return { existing: previous };
        const retryData = { ...previous.data, status: 'GENERATING', updatedAt: now() };
        await this.persistence.update(
          existing,
          { status: 'GENERATING', data: retryData },
          { transaction },
        );
        return {
          retry: {
            item: { ...previous, status: 'GENERATING', data: retryData },
            snapshot: previous.data.snapshot,
            template: previous.data.templateSnapshot,
            verificationCode: previous.data.verificationCode,
          },
        };
      }
      const [period, employee, company] = await Promise.all([
        this.sources.periods.findOne({ where: { companyId, id: run.periodId }, transaction }),
        this.sources.employees.findOne({ where: { companyId, id: input.employeeId }, transaction }),
        this.sources.company(companyId, transaction),
      ]);
      if (!period || !employee || !company)
        throw new NotFoundError('Payroll period, employee or employer');
      const calculation = validateCalculation(result.calculationSnapshot);
      if (
        calculation.employeeId !== input.employeeId ||
        calculation.grossAmount !== String(result.grossAmount) ||
        calculation.deductionsAmount !== String(result.deductionsAmount) ||
        calculation.netAmount !== String(result.netAmount) ||
        calculation.employerCostsAmount !== String(result.employerCostsAmount)
      )
        throw new ConflictError(
          'Payroll result does not reconcile with its immutable calculation snapshot.',
        );
      const earnings: PayslipLine[] = [],
        deductions: PayslipLine[] = [],
        employerCosts: PayslipLine[] = [];
      for (const [index, line] of calculation.lines.entries()) {
        const entry = {
          code: line.code,
          description: String((line as any).description ?? line.code),
          type: line.type,
          amount: line.amount,
          sourceReference: line.sourceReference,
          displayOrder: index + 1,
        };
        if (line.type === 'EARNING') earnings.push(entry);
        else if (line.type === 'DEDUCTION') deductions.push(entry);
        else employerCosts.push(entry);
      }
      if (
        cents(calculation.grossAmount) - cents(calculation.deductionsAmount) !==
        cents(calculation.netAmount)
      )
        throw new ValidationError('Payroll result totals do not reconcile.');
      const snapshot: PayslipSnapshot = {
        tenantId: String(companyId),
        employeeId: input.employeeId,
        payrollRunId: input.payrollRunId,
        payrollResultId: input.payrollResultId,
        employer: { name: company.name, taxId: company.nif ?? '', address: null },
        employee: {
          fullName: `${employee.firstName} ${employee.lastName}`.trim(),
          employeeCode: employee.employeeNumber,
          taxId: null,
          department: employee.departmentId ? String(employee.departmentId) : null,
          jobTitle: employee.jobTitle,
        },
        period: { startDate: String(period.startDate), endDate: String(period.endDate) },
        earnings,
        deductions,
        employerCosts,
        grossAmount: calculation.grossAmount,
        totalDeductions: calculation.deductionsAmount,
        netAmount: calculation.netAmount,
        employerCostsAmount: calculation.employerCostsAmount,
        currency: calculation.currency,
        payrollSnapshotHash: hash({
          id: result.id,
          companyId,
          runId: input.payrollRunId,
          calculation: result.calculationSnapshot,
        }),
        engineVersion: calculation.engineVersion,
        legalRuleSetVersion: calculation.legalRuleSetVersion,
      };
      const id = randomUUID(),
        issuedAt = now(),
        verificationCode = randomBytes(12).toString('hex').toUpperCase();
      const number = `PSL-${String(period.startDate).slice(0, 7).replace('-', '')}-${id.slice(0, 8).toUpperCase()}`;
      const data = {
        id,
        companyId,
        employeeId: input.employeeId,
        payrollRunId: input.payrollRunId,
        payrollResultId: input.payrollResultId,
        number,
        type: input.type ?? 'REGULAR',
        status: 'GENERATING',
        grossAmount: snapshot.grossAmount,
        totalDeductions: snapshot.totalDeductions,
        netAmount: snapshot.netAmount,
        currency: snapshot.currency,
        templateVersionId: template.id,
        templateSnapshot: template.data,
        documentId: id,
        verificationCodeHash: createHash('sha256').update(verificationCode).digest('hex'),
        verificationCode,
        createdAt: issuedAt,
        updatedAt: issuedAt,
        issuedAt,
        snapshot,
      };
      const row = await this.persistence.collections.payslip.create(
        {
          id,
          companyId,
          status: 'GENERATING',
          runId: input.payrollRunId,
          employeeId: input.employeeId,
          key: emissionKey,
          data,
        },
        { transaction },
      );
      await this.persistence.collections.payslipOutbox.create(
        {
          id: randomUUID(),
          companyId,
          status: 'PENDING',
          runId: input.payrollRunId,
          employeeId: input.employeeId,
          key: `payslip.generated:${id}`,
          data: { eventType: 'payslips.payslip.generation-started', aggregateId: id, actorUserId },
        },
        { transaction },
      );
      return { item: rec(row) as any, snapshot, template: template.data, verificationCode };
    });
    if ((created as any).existing) return this.present((created as any).existing.data);
    if ((created as any).retry)
      return this.renderAndStore(companyId, actorUserId, (created as any).retry);
    const { item, snapshot, template, verificationCode } = created as any;
    return this.renderAndStore(companyId, actorUserId, {
      item,
      snapshot,
      template,
      verificationCode,
    });
  }

  private async renderAndStore(
    companyId: number,
    actorUserId: number,
    source: {
      item: any;
      snapshot: PayslipSnapshot;
      template: RecordData;
      verificationCode: string;
    },
  ) {
    const { item, snapshot, template, verificationCode } = source;
    try {
      const bytes = this.renderer.render({
        ...snapshot,
        payslipNumber: item.data.number,
        issuedAt: item.data.issuedAt,
        verificationCode,
        template: template.layoutConfig ?? {},
      });
      const documentHash = createHash('sha256').update(bytes).digest('hex');
      const storageKey = await this.storage.put(companyId, item.id, bytes);
      const completed = await this.tenant(companyId, async (transaction) => {
        const row = await this.persistence.collections.payslip.findOne({
          where: { companyId, id: item.id },
          transaction,
          forUpdate: true,
        });
        if (!row) throw new NotFoundError('Payslip');
        const data = {
          ...(row.data as RecordData),
          status: 'VALIDATED',
          documentHash,
          documentStorageKey: storageKey,
          updatedAt: now(),
        };
        await this.persistence.update(row, { status: 'VALIDATED', data }, { transaction });
        await this.persistence.collections.payslipDocument.create(
          {
            id: randomUUID(),
            companyId,
            status: 'STORED',
            runId: item.payrollRunId,
            employeeId: item.employeeId,
            key: item.id,
            data: {
              payslipId: item.id,
              storageKey,
              mimeType: 'application/pdf',
              fileHash: documentHash,
              size: bytes.length,
              generatedAt: now(),
            },
          },
          { transaction },
        );
        await this.persistence.collections.payslipOutbox.create(
          {
            id: randomUUID(),
            companyId,
            status: 'PENDING',
            runId: item.payrollRunId,
            employeeId: item.employeeId,
            key: `payslip.validated:${item.id}`,
            data: { eventType: 'payslips.payslip.validated', aggregateId: item.id, documentHash },
          },
          { transaction },
        );
        return data;
      });
      await this.audit.record({
        companyId,
        actorUserId,
        action: 'payslips.payslip.generated',
        entityType: 'payslip',
        entityId: item.id,
        after: { status: 'VALIDATED', employeeId: item.employeeId, documentHash },
      });
      return this.present(completed);
    } catch (error) {
      await this.tenant(companyId, async (transaction) => {
        const row = await this.persistence.collections.payslip.findOne({
          where: { companyId, id: item.id },
          transaction,
        });
        if (row) {
          await this.persistence.update(
            row,
            {
              status: 'GENERATION_FAILED',
              data: {
                ...(row.data as RecordData),
                status: 'GENERATION_FAILED',
                errorCode: 'DOCUMENT_GENERATION_FAILED',
                updatedAt: now(),
              },
            },
            { transaction },
          );
          await this.persistence.collections.payslipOutbox.create(
            {
              id: randomUUID(),
              companyId,
              status: 'PENDING',
              runId: item.payrollRunId,
              employeeId: item.employeeId,
              key: `payslip.generation-failed:${item.id}:${Date.now()}`,
              data: {
                eventType: 'payslips.payslip.generation-failed',
                aggregateId: item.id,
                employeeId: item.employeeId,
                errorCode: 'DOCUMENT_GENERATION_FAILED',
              },
            },
            { transaction },
          );
        }
      });
      await this.audit.record({
        companyId,
        actorUserId,
        action: 'payslips.payslip.generation-failed',
        entityType: 'payslip',
        entityId: item.id,
        after: { errorCode: 'DOCUMENT_GENERATION_FAILED' },
      });
      throw error;
    }
  }

  async get(companyId: number, id: string) {
    return this.tenant(companyId, async (transaction) =>
      this.present((await this.findPayslip(companyId, id, transaction)).data),
    );
  }
  async download(
    companyId: number,
    id: string,
    actorUserId: number,
    action: 'DOWNLOAD' | 'PRINT' = 'DOWNLOAD',
  ) {
    const payslip = await this.tenant(companyId, async (transaction) =>
      this.findPayslip(companyId, id, transaction),
    );
    if (!['VALIDATED', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED'].includes(payslip.status))
      throw new ConflictError('Payslip document is not available.');
    const file = await this.storage.read(String(payslip.data.documentStorageKey));
    if (createHash('sha256').update(file).digest('hex') !== payslip.data.documentHash)
      throw new ConflictError('Payslip document integrity check failed.');
    await this.logAccess(companyId, id, actorUserId, action);
    return {
      file,
      name: `${payslip.data.number}.pdf`,
      mimeType: 'application/pdf',
      hash: payslip.data.documentHash,
    };
  }
  async preview(companyId: number, id: string) {
    const row = await this.tenant(companyId, (tx) => this.findPayslip(companyId, id, tx));
    return {
      id,
      status: row.data.status,
      preview: {
        employer: row.data.snapshot.employer,
        employee: row.data.snapshot.employee,
        period: row.data.snapshot.period,
        earnings: row.data.snapshot.earnings,
        deductions: row.data.snapshot.deductions,
        grossAmount: row.data.grossAmount,
        totalDeductions: row.data.totalDeductions,
        netAmount: row.data.netAmount,
        currency: row.data.currency,
      },
    };
  }
  async publish(companyId: number, actorUserId: number, id: string, input?: { channel?: string }) {
    return this.tenant(companyId, async (transaction) => {
      const row = await this.persistence.collections.payslip.findOne({
        where: { companyId, id },
        transaction,
        forUpdate: true,
      });
      if (!row) throw new NotFoundError('Payslip');
      if (!['VALIDATED', 'PUBLISHED'].includes(row.status))
        throw new ConflictError('Only validated payslips can be published.');
      if (row.status === 'PUBLISHED') return rec(row).data;
      if (rec(row).data.type === 'CORRECTION' && !rec(row).data.originalPayslipId)
        throw new ConflictError('Link the correction to its original payslip before publishing.');
      const publishedAt = now(),
        data: RecordData = {
          ...(row.data as RecordData),
          status: 'PUBLISHED',
          publishedAt,
          updatedAt: publishedAt,
        };
      await this.persistence.update(row, { status: 'PUBLISHED', data }, { transaction });
      if (data.type === 'CORRECTION' && data.originalPayslipId) {
        const original = await this.persistence.collections.payslip.findOne({
          where: { companyId, id: data.originalPayslipId },
          transaction,
          forUpdate: true,
        });
        if (!original || !['VALIDATED', 'PUBLISHED'].includes(original.status))
          throw new ConflictError('The original receipt is no longer eligible for correction.');
        if (original) {
          const originalData = {
            ...rec(original).data,
            status: 'SUPERSEDED',
            supersededBy: id,
            updatedAt: publishedAt,
          };
          await this.persistence.update(
            original,
            { status: 'SUPERSEDED', data: originalData },
            { transaction },
          );
        }
      }
      await this.persistence.collections.payslipPublication.create(
        {
          id: randomUUID(),
          companyId,
          status: 'PUBLISHED',
          runId: row.runId,
          employeeId: row.employeeId,
          key: id,
          data: {
            payslipId: id,
            publishedBy: actorUserId,
            channel: input?.channel ?? 'PORTAL',
            publishedAt,
          },
        },
        { transaction },
      );
      await this.persistence.collections.payslipDelivery.create(
        {
          id: randomUUID(),
          companyId,
          status: 'PENDING',
          runId: row.runId,
          employeeId: row.employeeId,
          key: `portal:${id}`,
          data: { payslipId: id, channel: 'PORTAL', status: 'AVAILABLE', attemptedAt: publishedAt },
        },
        { transaction },
      );
      await this.persistence.collections.payslipOutbox.create(
        {
          id: randomUUID(),
          companyId,
          status: 'PENDING',
          runId: row.runId,
          employeeId: row.employeeId,
          key: `payslip.published:${id}`,
          data: {
            eventType: 'payslips.payslip.published',
            aggregateId: id,
            actorUserId,
            employeeId: row.employeeId,
            payslipType: data.type,
          },
        },
        { transaction },
      );
      return data;
    }).then(async (data) => {
      await this.audit.record({
        companyId,
        actorUserId,
        action: 'payslips.payslip.published',
        entityType: 'payslip',
        entityId: id,
        after: { status: 'PUBLISHED' },
      });
      return this.present(data);
    });
  }
  async history(companyId: number, id: string) {
    return this.tenant(companyId, async (transaction) => {
      const payslip = await this.findPayslip(companyId, id, transaction);
      const publications = await this.persistence.collections.payslipPublication.findAll({
        where: { companyId, key: id },
        transaction,
      });
      const access = await this.persistence.collections.payslipAccessLog.findAll({
        where: { companyId, key: id },
        order: [['createdAt', 'ASC']],
        transaction,
      });
      const corrections = await this.persistence.collections.payslipCorrection.findAll({
        where: { companyId, key: { [Op.like]: `${id}:%` } },
        transaction,
      });
      return {
        payslip: this.present(payslip.data),
        events: [
          { type: 'payslips.payslip.generated', at: payslip.data.createdAt },
          ...publications.map((row) => rec(row).data),
          ...access.map((row) => rec(row).data),
          ...corrections.map((row) => rec(row).data),
        ],
      };
    });
  }
  async verification(companyId: number, id: string, actorId?: number) {
    const row = await this.tenant(companyId, (tx) => this.findPayslip(companyId, id, tx));
    if (!row.data.documentStorageKey || !row.data.documentHash)
      throw new ConflictError('Payslip document is not available for verification.');
    const file = await this.storage.read(String(row.data.documentStorageKey));
    const actual = createHash('sha256').update(file).digest('hex');
    await this.tenant(companyId, async (tx) => {
      await this.persistence.collections.payslipAccessLog.create(
        {
          id: randomUUID(),
          companyId,
          status: 'ACTIVE',
          runId: row.runId,
          employeeId: row.employeeId,
          key: id,
          data: {
            payslipId: id,
            actorId: actorId ?? null,
            action: 'VERIFY',
            verifiedAt: now(),
            valid: actual === row.data.documentHash,
          },
        },
        { transaction: tx },
      );
    });
    return {
      id,
      verificationCode: row.data.verificationCode,
      documentHash: row.data.documentHash,
      status: actual === row.data.documentHash ? 'VERIFIED' : 'INVALID',
      verifiedAt: now(),
    };
  }

  async listBatches(companyId: number) {
    return this.tenant(companyId, async (tx) =>
      (
        await this.persistence.collections.payslipBatch.findAll({
          where: { companyId },
          order: [['createdAt', 'DESC']],
          transaction: tx,
        })
      )
        .map(rec)
        .map((row) => row.data),
    );
  }
  async createBatch(
    companyId: number,
    actor: number,
    input: {
      payrollRunId: string;
      templateVersionId: string;
      type: Exclude<PayslipType, 'DUPLICATE_COPY'>;
      employeeIds: string[];
    },
  ) {
    return this.tenant(companyId, async (tx) => {
      const run = await this.sources.runs.findOne({
        where: { companyId, id: input.payrollRunId, status: 'CLOSED' },
        transaction: tx,
      });
      if (!run || run.runType === 'SIMULATION')
        throw new ConflictError('Batch generation requires a closed financial payroll run.');
      if (run.runType !== input.type || input.type === 'CORRECTION')
        throw new ConflictError('The batch type must match its payroll run. Link corrections individually.');
      const version = await this.findTemplateVersion(companyId, input.templateVersionId, tx);
      if (version.status !== 'PUBLISHED')
        throw new ConflictError('Template version must be published.');
      const results = await this.sources.results.findAll({
        where: { companyId, runId: input.payrollRunId, employeeId: { [Op.in]: input.employeeIds } },
        transaction: tx,
      });
      if (
        results.length !== new Set(input.employeeIds).size ||
        input.employeeIds.length !== new Set(input.employeeIds).size
      )
        throw new ValidationError(
          'Employees must be unique and have a result in the closed payroll.',
        );
      const id = randomUUID(),
        createdAt = now();
      const data = {
        id,
        companyId,
        payrollRunId: input.payrollRunId,
        templateVersionId: input.templateVersionId,
        type: input.type,
        status: 'PENDING',
        totalItems: results.length,
        completedItems: 0,
        failedItems: 0,
        createdAt,
        updatedAt: createdAt,
        createdBy: actor,
      };
      await this.persistence.collections.payslipBatch.create(
        {
          id,
          companyId,
          status: 'PENDING',
          runId: input.payrollRunId,
          employeeId: null,
          key: `batch:${id}`,
          data,
        },
        { transaction: tx },
      );
      for (const result of results) {
        const employeeId = String(result.employeeId),
          itemId = randomUUID();
        await this.persistence.collections.payslipBatchItem.create(
          {
            id: itemId,
            companyId,
            status: 'PENDING',
            runId: input.payrollRunId,
            employeeId,
            key: `${id}:${employeeId}`,
            data: {
              id: itemId,
              batchId: id,
              employeeId,
              payrollResultId: String(result.id),
              status: 'PENDING',
              errorCode: null,
              createdAt,
            },
          },
          { transaction: tx },
        );
      }
      await this.audit.record({
        companyId,
        actorUserId: actor,
        action: 'payslips.batch.created',
        entityType: 'payslip_batch',
        entityId: id,
        after: { totalItems: results.length },
      });
      return data;
    });
  }
  async getBatch(companyId: number, id: string): Promise<RecordData> {
    return this.tenant(companyId, async (tx) => {
      const batch = await this.persistence.collections.payslipBatch.findOne({
        where: { companyId, id },
        transaction: tx,
      });
      if (!batch) throw new NotFoundError('Payslip batch');
      const itemRows = await this.persistence.collections.payslipBatchItem.findAll({
        where: { companyId, runId: batch.runId, key: { [Op.like]: `${id}:%` } },
        transaction: tx,
      });
      const { data } = rec(batch);
      return {
        ...data,
        items: itemRows
          .map(rec)
          .filter((item) => item.data.batchId === id)
          .map((item) => item.data),
      };
    });
  }
  async generateBatch(companyId: number, actor: number, id: string) {
    const batch = await this.getBatch(companyId, id);
    await Promise.all(
      batch.items
        .filter((item: any) => item.status !== 'GENERATED')
        .map((item: any) => this.generateBatchItem(companyId, actor, id, item.id)),
    );
    return this.refreshBatch(companyId, id);
  }
  async generateBatchItem(companyId: number, actor: number, batchId: string, itemId: string) {
    const batch = await this.getBatch(companyId, batchId);
    const item = batch.items.find((entry: any) => entry.id === itemId);
    if (!item) throw new NotFoundError('Payslip batch item');
    if (item.status === 'GENERATED') return item;
    try {
      await this.tenant(companyId, async (tx) => {
        const row = await this.persistence.collections.payslipBatchItem.findOne({
          where: { companyId, id: itemId },
          transaction: tx,
          forUpdate: true,
        });
        if (row)
          await this.persistence.update(
            row,
            { status: 'GENERATING', data: { ...rec(row).data, status: 'GENERATING' } },
            { transaction: tx },
          );
      });
      const generated = await this.generate(companyId, actor, {
        payrollRunId: batch.payrollRunId,
        payrollResultId: item.payrollResultId,
        employeeId: item.employeeId,
        templateVersionId: batch.templateVersionId,
        type: batch.type,
        idempotencyKey: item.id,
      });
      if (!['VALIDATED', 'PUBLISHED'].includes(generated.status))
        throw new ConflictError('The batch item has no publishable payslip.');
      await this.tenant(companyId, async (tx) => {
        const row = await this.persistence.collections.payslipBatchItem.findOne({
          where: { companyId, id: itemId },
          transaction: tx,
        });
        if (row)
          await this.persistence.update(
            row,
            { status: 'GENERATED', data: { ...rec(row).data, status: 'GENERATED', payslipId: generated.id } },
            { transaction: tx },
          );
      });
    } catch (error) {
      await this.tenant(companyId, async (tx) => {
        const row = await this.persistence.collections.payslipBatchItem.findOne({
          where: { companyId, id: itemId },
          transaction: tx,
        });
        if (row)
          await this.persistence.update(
            row,
            {
              status: 'GENERATION_FAILED',
              data: {
                ...rec(row).data,
                status: 'GENERATION_FAILED',
                errorCode: 'GENERATION_FAILED',
              },
            },
            { transaction: tx },
          );
      });
    }
    await this.refreshBatch(companyId, batchId);
    return (await this.getBatch(companyId, batchId)).items.find(
      (entry: any) => entry.id === itemId,
    );
  }
  private async refreshBatch(companyId: number, id: string) {
    return this.tenant(companyId, async (tx) => {
      const batch = await this.persistence.collections.payslipBatch.findOne({
        where: { companyId, id },
        transaction: tx,
      });
      if (!batch) throw new NotFoundError('Payslip batch');
      const rows = (
        await this.persistence.collections.payslipBatchItem.findAll({
          where: { companyId, runId: batch.runId, key: { [Op.like]: `${id}:%` } },
          transaction: tx,
        })
      )
        .map(rec)
        .filter((row) => row.data.batchId === id);
      const complete = rows.filter((row) => row.status === 'GENERATED').length,
        failed = rows.filter((row) => row.status === 'GENERATION_FAILED').length;
      const status =
        complete + failed === rows.length
          ? failed
            ? complete ? 'PARTIALLY_COMPLETED' : 'FAILED'
            : 'COMPLETED'
          : complete || failed
            ? 'STARTED'
            : 'PENDING';
      const data = {
        ...rec(batch).data,
        status,
        totalItems: rows.length,
        completedItems: complete,
        failedItems: failed,
        updatedAt: now(),
      };
      await this.persistence.update(batch, { status, data }, { transaction: tx });
      return { ...data, items: rows.map((row) => row.data) };
    });
  }
  async getBatchProgress(companyId: number, id: string) {
    const batch = await this.getBatch(companyId, id);
    return {
      id,
      status: batch.status,
      total: batch.totalItems,
      completed: batch.completedItems,
      failed: batch.failedItems,
      pending: batch.totalItems - batch.completedItems - batch.failedItems,
    };
  }
  async requestBatchGeneration(companyId: number, actor: number, id: string): Promise<RecordData> {
    if (!this.batchEnqueuer) return this.generateBatch(companyId, actor, id);
    const batch = await this.getBatch(companyId, id);
    if (batch.status === 'COMPLETED') return batch;
    await this.tenant(companyId, async (tx) => {
      const row = await this.persistence.collections.payslipBatch.findOne({
        where: { companyId, id },
        transaction: tx,
        forUpdate: true,
      });
      if (!row) throw new NotFoundError('Payslip batch');
      await this.persistence.update(
        row,
        { status: 'STARTED', data: { ...rec(row).data, status: 'STARTED', updatedAt: now() } },
        { transaction: tx },
      );
    });
    await this.batchEnqueuer(companyId, actor, id);
    return { ...batch, status: 'STARTED', queued: true };
  }
  async retryFailed(companyId: number, actor: number, id: string) {
    const batch = await this.getBatch(companyId, id);
    for (const item of batch.items.filter((row: any) => row.status === 'GENERATION_FAILED')) {
      await this.tenant(companyId, async (tx) => {
        const row = await this.persistence.collections.payslipBatchItem.findOne({
          where: { companyId, id: item.id },
          transaction: tx,
        });
        if (row)
          await this.persistence.update(
            row,
            { status: 'PENDING', data: { ...rec(row).data, status: 'PENDING', errorCode: null } },
            { transaction: tx },
          );
      });
    }
    return this.requestBatchGeneration(companyId, actor, id);
  }
  async publishBatch(companyId: number, actor: number, id: string) {
    const batch = await this.getBatch(companyId, id);
    let published = 0;
    for (const item of batch.items.filter((row: any) => row.status === 'GENERATED')) {
      const payslip = await this.tenant(companyId, (tx) =>
        this.persistence.collections.payslip.findOne({
          where: {
            companyId,
            employeeId: item.employeeId,
            runId: batch.payrollRunId,
            status: 'VALIDATED',
            key: `${item.payrollResultId}:${batch.type}`,
            ...(item.payslipId ? { id: item.payslipId } : {}),
          },
          transaction: tx,
        }),
      );
      if (payslip) {
        await this.publish(companyId, actor, payslip.id);
        published++;
      }
    }
    return { batch: await this.getBatch(companyId, id), published };
  }

  async listTemplates(companyId: number) {
    return this.tenant(companyId, async (tx) =>
      (
        await this.persistence.collections.payslipTemplate.findAll({
          where: { companyId },
          order: [['createdAt', 'DESC']],
          transaction: tx,
        })
      )
        .map(rec)
        .map((row) => row.data),
    );
  }
  async getPolicy(companyId: number) {
    return this.tenant(companyId, async (tx) => {
      const row = await this.persistence.collections.payslipPolicy.findOne({
        where: { companyId, status: 'ACTIVE' },
        order: [['createdAt', 'DESC']],
        transaction: tx,
      });
      return row
        ? rec(row).data
        : {
            version: 0,
            retentionDays: null,
            allowWorkerDownload: true,
            notifyWorkerOnPublish: true,
            requireManualPublication: true,
          };
    });
  }
  async updatePolicy(
    companyId: number,
    actor: number,
    input: {
      retentionDays: number | null;
      allowWorkerDownload: boolean;
      notifyWorkerOnPublish: boolean;
      requireManualPublication: boolean;
    },
  ) {
    const data = await this.tenant(companyId, async (tx) => {
      const active = await this.persistence.collections.payslipPolicy.findAll({
        where: { companyId, status: 'ACTIVE' },
        transaction: tx,
        forUpdate: true,
      });
      const version =
        active.reduce((max, row) => Math.max(max, Number(rec(row).data.version ?? 0)), 0) + 1;
      for (const row of active)
        await this.persistence.update(
          row,
          {
            status: 'SUPERSEDED',
            data: { ...rec(row).data, status: 'SUPERSEDED', effectiveTo: now() },
          },
          { transaction: tx },
        );
      const id = randomUUID(),
        createdAt = now(),
        policy = {
          id,
          companyId,
          version,
          ...input,
          status: 'ACTIVE',
          effectiveFrom: createdAt,
          effectiveTo: null,
          updatedBy: actor,
          createdAt,
        };
      await this.persistence.collections.payslipPolicy.create(
        {
          id,
          companyId,
          status: 'ACTIVE',
          runId: null,
          employeeId: null,
          key: `policy:${version}`,
          data: policy,
        },
        { transaction: tx },
      );
      return policy;
    });
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: 'payslips.policy.updated',
      entityType: 'payslip_policy',
      entityId: data.id,
      after: {
        version: data.version,
        allowWorkerDownload: data.allowWorkerDownload,
        retentionDays: data.retentionDays,
      },
    });
    return data;
  }
  async createTemplate(
    companyId: number,
    actor: number,
    input: { code: string; name: string; description?: string },
  ) {
    return this.tenant(companyId, async (tx) => {
      const id = randomUUID(),
        timestamp = now(),
        data = {
          id,
          companyId,
          ...input,
          status: 'DRAFT',
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      await this.persistence.collections.payslipTemplate.create(
        { id, companyId, status: 'DRAFT', runId: null, employeeId: null, key: input.code, data },
        { transaction: tx },
      );
      await this.audit.record({
        companyId,
        actorUserId: actor,
        action: 'payslips.template.created',
        entityType: 'payslip_template',
        entityId: id,
        after: { code: input.code },
      });
      return data;
    });
  }
  async getTemplate(companyId: number, id: string) {
    return this.tenant(companyId, async (tx) => {
      const row = await this.persistence.collections.payslipTemplate.findOne({
        where: { companyId, id },
        transaction: tx,
      });
      if (!row) throw new NotFoundError('Payslip template');
      const versions = await this.persistence.collections.payslipTemplateVersion.findAll({
        where: { companyId, employeeId: id },
        transaction: tx,
      });
      return { ...rec(row).data, versions: versions.map(rec).map((version) => version.data) };
    });
  }
  async createTemplateVersion(
    companyId: number,
    actor: number,
    input: {
      templateId: string;
      version: string;
      layoutConfig: Record<string, unknown>;
      logoUrl?: string;
    },
  ) {
    return this.tenant(companyId, async (tx) => {
      const template = await this.persistence.collections.payslipTemplate.findOne({
        where: { companyId, id: input.templateId },
        transaction: tx,
      });
      if (!template) throw new NotFoundError('Payslip template');
      const id = randomUUID(),
        timestamp = now(),
        data = {
          id,
          companyId,
          templateId: input.templateId,
          version: input.version,
          layoutConfig: input.layoutConfig,
          logoUrl: input.logoUrl,
          status: 'DRAFT',
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      await this.persistence.collections.payslipTemplateVersion.create(
        {
          id,
          companyId,
          status: 'DRAFT',
          runId: null,
          employeeId: input.templateId,
          key: `${input.templateId}:${input.version}`,
          data,
        },
        { transaction: tx },
      );
      return data;
    });
  }
  async previewTemplate(companyId: number, templateId: string, version: string) {
    return this.tenant(companyId, async (tx) => {
      const row = await this.persistence.collections.payslipTemplateVersion.findOne({
        where: { companyId, employeeId: templateId, key: `${templateId}:${version}` },
        transaction: tx,
      });
      if (!row) throw new NotFoundError('Payslip template preview');
      return rec(row).data;
    });
  }
  async publishTemplateVersion(companyId: number, actor: number, id: string) {
    return this.tenant(companyId, async (tx) => {
      const row = await this.persistence.collections.payslipTemplateVersion.findOne({
        where: { companyId, id },
        transaction: tx,
        forUpdate: true,
      });
      if (!row) throw new NotFoundError('Payslip template version');
      const data = { ...rec(row).data, status: 'PUBLISHED', updatedAt: now() };
      await this.persistence.update(row, { status: 'PUBLISHED', data }, { transaction: tx });
      if (row.employeeId) {
        const template = await this.persistence.collections.payslipTemplate.findOne({
          where: { companyId, id: row.employeeId },
          transaction: tx,
        });
        if (template)
          await this.persistence.update(
            template,
            {
              status: 'PUBLISHED',
              data: { ...rec(template).data, status: 'PUBLISHED', updatedAt: now() },
            },
            { transaction: tx },
          );
      }
      await this.audit.record({
        companyId,
        actorUserId: actor,
        action: 'payslips.template.version-published',
        entityType: 'payslip_template_version',
        entityId: id,
        after: { status: 'PUBLISHED' },
      });
      return data;
    });
  }

  async createCorrection(
    companyId: number,
    actor: number,
    originalId: string,
    input: {
      reason: string;
      payrollRunId: string;
      payrollResultId: string;
      templateVersionId: string;
    },
  ) {
    if (!input.reason.trim()) throw new ValidationError('Correction reason is required.');
    const original = await this.tenant(companyId, (tx) =>
      this.findPayslip(companyId, originalId, tx),
    );
    if (!['VALIDATED', 'PUBLISHED'].includes(original.status) || original.data.type === 'DUPLICATE_COPY')
      throw new ConflictError('The original must be a current, issued payslip.');
    const correctionRun = await this.tenant(companyId, async (tx) =>
      this.sources.runs.findOne({
        where: { companyId, id: input.payrollRunId, status: 'CLOSED' },
        transaction: tx,
      }),
    );
    if (
      !correctionRun ||
      correctionRun.runType !== 'CORRECTION' ||
      correctionRun.originalRunId !== original.data.payrollRunId
    )
      throw new ConflictError(
        'A rectification must use a closed CORRECTION payroll run linked to the original run.',
      );
    const correctionPayslip = await this.generate(companyId, actor, {
      payrollRunId: input.payrollRunId,
      payrollResultId: input.payrollResultId,
      employeeId: original.employeeId!,
      templateVersionId: input.templateVersionId,
      type: 'CORRECTION',
    });
    return this.tenant(companyId, async (tx) => {
      const generated = await this.persistence.collections.payslip.findOne({
        where: { companyId, id: correctionPayslip.id },
        transaction: tx,
        forUpdate: true,
      });
      if (!generated) throw new NotFoundError('Correction payslip');
      const correction = rec(generated);
      if (correction.data.originalPayslipId && correction.data.originalPayslipId !== originalId)
        throw new ConflictError('This correction is already linked to another receipt.');
      if (!['VALIDATED', 'PUBLISHED'].includes(correction.status))
        throw new ConflictError('The correction document has not finished generating.');
      await this.persistence.update(
        generated,
        {
          data: {
            ...correction.data,
            originalPayslipId: originalId,
            correctionReason: input.reason.trim(),
          },
        },
        { transaction: tx },
      );
      const existing = await this.persistence.collections.payslipCorrection.findOne({
        where: { companyId, key: `${originalId}:${correctionPayslip.id}` },
        transaction: tx,
      });
      if (existing) return rec(existing).data;
      const id = randomUUID(),
        data = {
          id,
          companyId,
          originalPayslipId: originalId,
          correctionPayslipId: correctionPayslip.id,
          reason: input.reason.trim(),
          createdAt: now(),
        };
      await this.persistence.collections.payslipCorrection.create(
        {
          id,
          companyId,
          status: 'ACTIVE',
          runId: input.payrollRunId,
          employeeId: original.employeeId,
          key: `${originalId}:${correctionPayslip.id}`,
          data,
        },
        { transaction: tx },
      );
      await this.audit.record({
        companyId,
        actorUserId: actor,
        action: 'payslips.correction.created',
        entityType: 'payslip_correction',
        entityId: id,
        after: { originalPayslipId: originalId, correctionPayslipId: correctionPayslip.id },
      });
      return data;
    });
  }
  async getCorrections(companyId: number, id: string) {
    return this.tenant(companyId, async (tx) =>
      (
        await this.persistence.collections.payslipCorrection.findAll({
          where: { companyId, key: { [Op.like]: `${id}:%` } },
          transaction: tx,
        })
      )
        .map(rec)
        .map((row) => row.data),
    );
  }
  async duplicateCopy(companyId: number, actor: number, id: string) {
    const original = await this.tenant(companyId, (tx) => this.findPayslip(companyId, id, tx));
    if (!['VALIDATED', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED'].includes(original.status))
      throw new ConflictError('Only an issued payslip can have a duplicate copy.');
    const source = await this.storage.read(original.data.documentStorageKey);
    if (createHash('sha256').update(source).digest('hex') !== original.data.documentHash)
      throw new ConflictError('Original document integrity check failed.');
    const copyId = randomUUID(),
      code = randomBytes(12).toString('hex').toUpperCase(),
      number = `${original.data.number}-2VIA`,
      issuedAt = now();
    const bytes = this.renderer.render({
      ...original.data.snapshot,
      payslipNumber: number,
      issuedAt,
      verificationCode: code,
      template: original.data.templateSnapshot?.layoutConfig ?? {},
      copyLabel: 'SEGUNDA VIA - DOCUMENTO REPRODUZIDO',
    });
    const fileHash = createHash('sha256').update(bytes).digest('hex'),
      key = await this.storage.put(companyId, copyId, bytes);
    const data = {
      ...original.data,
      id: copyId,
      number,
      type: 'DUPLICATE_COPY',
      status: 'VALIDATED',
      originalPayslipId: id,
      isDuplicateCopy: true,
      documentId: copyId,
      documentStorageKey: key,
      documentHash: fileHash,
      verificationCodeHash: createHash('sha256').update(code).digest('hex'),
      verificationCode: code,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    };
    await this.tenant(companyId, async (tx) => {
      await this.persistence.collections.payslip.create(
        {
          id: copyId,
          companyId,
          status: 'VALIDATED',
          runId: original.runId,
          employeeId: original.employeeId,
          key: `duplicate:${id}:${copyId}`,
          data,
        },
        { transaction: tx },
      );
      await this.persistence.collections.payslipDocument.create(
        {
          id: randomUUID(),
          companyId,
          status: 'STORED',
          runId: original.runId,
          employeeId: original.employeeId,
          key: copyId,
          data: {
            payslipId: copyId,
            storageKey: key,
            mimeType: 'application/pdf',
            fileHash,
            generatedAt: issuedAt,
            copyOf: id,
          },
        },
        { transaction: tx },
      );
    });
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: 'payslips.payslip.duplicate-issued',
      entityType: 'payslip',
      entityId: copyId,
      after: { originalPayslipId: id },
    });
    return this.present(data);
  }

  async linkEmployee(companyId: number, actor: number, employeeId: string, userId: number) {
    return this.tenant(companyId, async (tx) => {
      const employee = await this.sources.employees.findOne({
        where: { companyId, id: employeeId },
        transaction: tx,
      });
      if (!employee) throw new NotFoundError('Employee');
      const member = await this.sources.hasActiveMembership(companyId, userId, tx);
      if (!member)
        throw new ValidationError('The user must have an active membership in this company.');
      const existing = await this.persistence.collections.employeeUserLink.findOne({
        where: { companyId, employeeId, status: 'ACTIVE' },
        transaction: tx,
      });
      if (existing && rec(existing).data.userId !== userId)
        throw new ConflictError('This employee is already linked to another user.');
      const id = randomUUID();
      if (existing) return { employeeId, userId };
      await this.persistence.collections.employeeUserLink.create(
        {
          id,
          companyId,
          status: 'ACTIVE',
          runId: null,
          employeeId,
          key: String(userId),
          data: { userId, employeeId, linkedBy: actor, linkedAt: now() },
        },
        { transaction: tx },
      );
      return { employeeId, userId };
    });
  }
  private async employeeForUser(companyId: number, userId: number) {
    return this.tenant(companyId, async (tx) => {
      const links = await this.persistence.collections.employeeUserLink.findAll({
        where: { companyId, status: 'ACTIVE' },
        transaction: tx,
      });
      const link = links.map(rec).find((row) => row.data.userId === userId);
      if (!link)
        throw new ForbiddenError(
          'No employee profile is linked to this user in the selected company.',
        );
      return String(link.data.employeeId);
    });
  }
  async myPayslips(
    companyId: number,
    userId: number,
    query: { page: number; limit: number; status?: string },
  ) {
    const employeeId = await this.employeeForUser(companyId, userId);
    return this.tenant(companyId, async (tx) => {
      const where = { companyId, employeeId, status: 'PUBLISHED' };
      const total = await this.persistence.collections.payslip.count({ where, transaction: tx });
      const rows = await this.persistence.collections.payslip.findAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        transaction: tx,
      });
      return {
        page: query.page,
        limit: query.limit,
        total,
        data: rows.map(rec).map((row) => this.present(row.data)),
      };
    });
  }
  async myPayslip(companyId: number, userId: number, id: string) {
    const employeeId = await this.employeeForUser(companyId, userId);
    const row = await this.tenant(companyId, async (tx) => {
      const payslip = await this.persistence.collections.payslip.findOne({
        where: { companyId, id, employeeId },
        transaction: tx,
      });
      if (!payslip || payslip.status !== 'PUBLISHED') throw new NotFoundError('My payslip');
      return rec(payslip);
    });
    await this.logAccess(companyId, id, userId, 'VIEW');
    return this.present(row.data);
  }
  async myDownload(companyId: number, userId: number, id: string) {
    const policy = await this.getPolicy(companyId);
    if (!policy.allowWorkerDownload)
      throw new ForbiddenError('Worker downloads are disabled by company policy.');
    await this.myPayslip(companyId, userId, id);
    return this.download(companyId, id, userId);
  }
  async logAccess(companyId: number, id: string, actorUserId: number, action: string) {
    await this.tenant(companyId, async (tx) => {
      await this.persistence.collections.payslipAccessLog.create(
        {
          id: randomUUID(),
          companyId,
          status: 'ACTIVE',
          runId: null,
          employeeId: null,
          key: id,
          data: { payslipId: id, actorId: actorUserId, action, accessedAt: now() },
        },
        { transaction: tx },
      );
    });
  }
  async reportSummary(companyId: number) {
    return this.tenant(companyId, async (tx) => {
      const rows = await this.persistence.collections.payslip.count({ where: { companyId }, group: ['status'], transaction: tx });
      const totals = new Map(Array.isArray(rows) ? rows.map(row => [row.status, Number(row.count)]) : []);
      const count = (...statuses: string[]) => statuses.reduce((total, status) => total + (totals.get(status) ?? 0), 0);
      return {
        totalGenerated: count('GENERATED', 'VALIDATED', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED'),
        published: count('PUBLISHED'),
        pending: count('PENDING', 'GENERATING'),
        failed: count('GENERATION_FAILED', 'PUBLICATION_FAILED'),
      };
    });
  }
  async exportReport(
    companyId: number,
    actor: number,
    input: {
      format: 'PDF' | 'CSV' | 'XLSX';
      reportType: 'summary' | 'emissions' | 'pending' | 'failed' | 'publication';
    },
  ) {
    const records = await this.tenant(companyId, async (tx) =>
      (
        await this.persistence.collections.payslip.findAll({
          where: { companyId },
          order: [['createdAt', 'DESC']],
          transaction: tx,
        })
      )
        .map(rec)
        .map((row) => row.data),
    );
    const filtered = records.filter((row) =>
      input.reportType === 'pending'
        ? ['PENDING', 'GENERATING'].includes(row.status)
        : input.reportType === 'failed'
          ? ['GENERATION_FAILED', 'PUBLICATION_FAILED'].includes(row.status)
          : input.reportType === 'publication'
            ? ['PUBLISHED', 'SUPERSEDED', 'ARCHIVED'].includes(row.status)
            : true,
    );
    const rows = [
      [
        'Recibo',
        'Codigo trabalhador',
        'Trabalhador',
        'Periodo inicial',
        'Periodo final',
        'Tipo',
        'Estado',
        'Bruto',
        'Descontos',
        'Liquido',
        'Moeda',
        'Emitido em',
      ],
      ...filtered.map((row) =>
        [
          row.number,
          row.snapshot?.employee?.employeeCode,
          row.snapshot?.employee?.fullName,
          row.snapshot?.period?.startDate,
          row.snapshot?.period?.endDate,
          row.type,
          row.status,
          row.grossAmount,
          row.totalDeductions,
          row.netAmount,
          row.currency,
          row.createdAt,
        ].map((value) => String(value ?? '')),
      ),
    ];
    const safe = (value: string) => (/^[=+@\-]/.test(value) ? `'${value}` : value);
    const date = now().slice(0, 10),
      base = `payslips-${input.reportType}-${date}`;
    let file: Buffer, mimeType: string, name: string;
    if (input.format === 'XLSX') {
      file = this.reportRenderer.xlsx(rows.map((row) => row.map(safe)));
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      name = `${base}.xlsx`;
    } else if (input.format === 'PDF') {
      file = this.reportRenderer.pdf(rows.map((row) => row.map(safe)));
      mimeType = 'application/pdf';
      name = `${base}.pdf`;
    } else {
      const csv = rows
        .map((row) => row.map((value) => `"${safe(value).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');
      file = Buffer.from(`\uFEFF${csv}`, 'utf8');
      mimeType = 'text/csv; charset=utf-8';
      name = `${base}.csv`;
    }
    const reportId = randomUUID();
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: 'payslips.report.exported',
      entityType: 'payslip_report',
      entityId: reportId,
      after: { format: input.format, reportType: input.reportType, rows: filtered.length },
    });
    return { file, mimeType, name, rows: filtered.length };
  }
}
