import { ReportDataRow } from '../../application/ports/report-source.port';

import { Op, QueryTypes, WhereOptions, Transaction, Model, col, fn } from 'sequelize';

import { sequelize } from '../../../../infra/database/index';
import { EmployeeModel } from '../../../employees/infrastructure/persistence/models/employee.model';
import { EmploymentContractModel } from '../../../contracts/infrastructure/persistence/models/employment-contract.model';
import { AttendanceRecordModel } from '../../../attendance/infrastructure/persistence/models/attendance-record.model';
import { LeaveRequestModel } from '../../../leave/infrastructure/persistence/models/leave-request.model';
import {
  PayrollRunModel,
  PayrollEmployeeResultModel,
  PayrollPeriodModel,
} from '../../../payroll/infrastructure/persistence/models/payroll.models';
import {
  PayrollPaymentInstructionModel,
  PayrollPaymentTransactionModel,
  PayrollPaymentReturnModel,
} from '../../../payments/infrastructure/persistence/models/payment.models';
import { EmployeeLoanModel } from '../../../loans/infrastructure/persistence/models/employee-loan.model';
import {
  PayslipModel,
  PayslipPublicationModel,
  PayslipDeliveryModel,
} from '../../../payslips/infrastructure/persistence/models/payslips.models';
import { ReportDefinition } from '../../domain/report-catalog';

import { ReportFilters } from '../../application/dto/report-filters';
import { ReportSourcePort } from '../../application/ports/report-source.port';
import { cents, money } from '../../../payroll/domain/payroll-result';

const timestampBounds = (filters: ReportFilters) => ({
  ...(filters.from ? { [Op.gte]: new Date(filters.from + 'T00:00:00+01:00') } : {}),
  ...(filters.to ? { [Op.lt]: new Date(Date.parse(filters.to + 'T00:00:00+01:00') + 86400000) } : {}),
});

function reportRow(model: Model): ReportDataRow {
  const data: unknown = model.get({ plain: true });
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Invalid report projection.');
  return data as ReportDataRow;
}
export class SequelizeReportSource implements ReportSourcePort {
  async dashboardData(companyId: number, filters: ReportFilters, includePayroll = true) {
    return this.withTenant(companyId, async transaction => {
      const where = { companyId, ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
        ...(filters.employeeId ? { id: filters.employeeId } : {}) };
      const active = await EmployeeModel.count({ where: { ...where, status: 'ACTIVE' }, transaction });
      const employees = await EmployeeModel.count({ where, transaction });
      const payroll = includePayroll ? await this.readPayroll(companyId, filters, transaction, undefined, true) : [];
      return { active, employees, payroll };
    });
  }

  async readSource(
    companyId: number,
    report: ReportDefinition,
    filters: ReportFilters,
  ): Promise<ReportDataRow[]> {
    const limit = Math.max(1, Math.min(Number(filters.limit || 1000), 5000));
    return this.withTenant(companyId, async (transaction) => {
      const departmentEmployees = filters.departmentId
        ? await EmployeeModel.findAll({
            where: { companyId, departmentId: filters.departmentId },
            attributes: ['id'],
            transaction,
          })
        : null;
      const departmentEmployeeIds = departmentEmployees?.map((employee) => employee.id) || null;
      const whereFor = (field?: string): WhereOptions => {
        const where: Record<string, unknown> = { companyId };
        if (filters.employeeId) where.employeeId = filters.employeeId;
        if (departmentEmployeeIds)
          where.employeeId = filters.employeeId
            ? departmentEmployeeIds.includes(filters.employeeId)
              ? filters.employeeId
              : '00000000-0000-0000-0000-000000000000'
            : { [Op.in]: departmentEmployeeIds };
        if (field && (filters.from || filters.to))
          where[field] = field === 'createdAt' ? timestampBounds(filters) : {
            ...(filters.from ? { [Op.gte]: filters.from } : {}),
            ...(filters.to ? { [Op.lte]: filters.to } : {}),
          };
        if (filters.status && !['payroll', 'attendance'].includes(report.source)) where.status = filters.status;
        return where as WhereOptions;
      };
      switch (report.source) {
        case 'employees': {
          const where: Record<string, unknown> = { companyId };
          if (filters.employeeId) where.id = filters.employeeId;
          if (filters.departmentId) where.departmentId = filters.departmentId;
          if (filters.status) where.status = filters.status;
          const dateField = report.code === 'RPT-HR-004' ? 'terminationDate' : 'admissionDate';
          if (report.code === 'RPT-HR-004') where[dateField] = { [Op.ne]: null };
          if (filters.from || filters.to)
            where[dateField] = {
              ...(filters.from ? { [Op.gte]: filters.from } : {}),
              ...(filters.to ? { [Op.lte]: filters.to } : {}),
            };
          const rows = await EmployeeModel.findAll({
            where: where as WhereOptions,
            attributes: [
              'id',
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
            order: [['lastName', 'ASC']],
            limit,
            transaction,
          });
          return rows.map((r) => reportRow(r));
        }
        case 'contracts': {
          const rows = await EmploymentContractModel.findAll({
            where: { ...whereFor('startDate'), ...(report.code === 'RPT-CTR-001' ? { status: 'ACTIVE' } : {}) },
            attributes: [
              'id',
              'employeeId',
              'contractNumber',
              'typeCode',
              'status',
              'startDate',
              'endDate',
              'currency',
            ],
            order: [['startDate', 'DESC']],
            limit,
            transaction,
          });
          return rows.map((r) => reportRow(r));
        }
        case 'attendance': {
          const rows = await AttendanceRecordModel.findAll({
            where: whereFor('workDate'),
            attributes: ['id', 'employeeId', 'punchType', 'occurredAt', 'workDate', 'source'],
            order: [['occurredAt', 'DESC']],
            limit,
            transaction,
          });
          return rows.map((r) => reportRow(r));
        }
        case 'leave': {
          const rows = await LeaveRequestModel.findAll({
            where: { ...whereFor('startDate'), ...(report.code === 'RPT-LEV-002' ? { status: 'APPROVED' } : {}) },
            attributes: [
              'id',
              'employeeId',
              'leaveType',
              'status',
              'requestedDays',
              'startDate',
              'endDate',
              'submittedAt',
              'decidedAt',
            ],
            order: [['startDate', 'DESC']],
            limit,
            transaction,
          });
          return rows.map((r) => reportRow(r));
        }
        case 'payroll':
          return this.readPayroll(companyId, filters, transaction, report.code);
        case 'payments': {
          const model =
            report.code === 'RPT-PMT-003'
              ? PayrollPaymentReturnModel
              : report.code === 'RPT-PMT-007'
                ? PayrollPaymentTransactionModel
                : PayrollPaymentInstructionModel;
          const rows = await model.findAll({
            where: whereFor('createdAt'),
            ...(model === PayrollPaymentInstructionModel ? { attributes: [
              'id', 'employeeId', 'amount', 'currency', 'paymentType', 'method', 'status', 'createdAt',
            ] } : {}),
            limit,
            order: [['createdAt', 'DESC']],
            transaction,
          });
          return rows.map((r: Model) => {
            const d = reportRow(r);
            delete d.beneficiarySnapshot;
            delete d.accountCiphertext;
            return d;
          });
        }
        case 'loans': {
          const rows = await EmployeeLoanModel.findAll({
            where: whereFor('createdAt'),
            attributes: [
              'id',
              'employeeId',
              'loanNumber',
              'principalAmount',
              'currency',
              'status',
              'disbursedAt',
              'createdAt',
            ],
            limit,
            order: [['createdAt', 'DESC']],
            transaction,
          });
          return rows.map((r) => reportRow(r));
        }
        case 'payslips': {
          const model =
            report.code === 'RPT-PSL-004'
              ? PayslipDeliveryModel
              : report.code === 'RPT-PSL-006'
                ? PayslipPublicationModel
                : PayslipModel;
          const rows = await model.findAll({
            where: whereFor('createdAt'),
            attributes: { exclude: ['data'] },
            limit,
            order: [['createdAt', 'DESC']],
            transaction,
          });
          return rows.map((r: Model) => {
            const d = reportRow(r);
            delete d.data;
            return d;
          });
        }
        default:
          return [];
      }
    });
  }
  private async readPayroll(
    companyId: number,
    filters: ReportFilters,
    transaction?: Transaction,
    reportCode?: string,
    aggregate = false,
  ): Promise<ReportDataRow[]> {
    const periodWhere: Record<string, unknown> = { companyId };
    if (filters.from || filters.to)
      periodWhere.startDate = {
        ...(filters.from ? { [Op.gte]: filters.from } : {}),
        ...(filters.to ? { [Op.lte]: filters.to } : {}),
      };
    const periods = await PayrollPeriodModel.findAll({
      where: periodWhere as WhereOptions,
      attributes: ['id'],
      transaction,
    });
    const periodIds = periods.map((p) => p.id);
    if (!periodIds.length) return [];
    const runs = await PayrollRunModel.findAll({
      where: { companyId, periodId: { [Op.in]: periodIds }, status: 'CLOSED' },
      attributes: ['id'],
      transaction,
    });
    const runIds = runs.map((r) => r.id);
    if (!runIds.length) return [];
    const where: Record<string, unknown> = { companyId, runId: { [Op.in]: runIds } };
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.departmentId) {
      const employees = await EmployeeModel.findAll({
        where: { companyId, departmentId: filters.departmentId },
        attributes: ['id'],
        transaction,
      });
      const employeeIds = employees.map((employee) => employee.id);
      if (!employeeIds.length) return [];
      if (filters.employeeId && !employeeIds.includes(filters.employeeId)) return [];
      where.employeeId = filters.employeeId ?? { [Op.in]: employeeIds };
    }
    if (aggregate) {
      const rows = await PayrollEmployeeResultModel.findAll({
        where, transaction, group: ['currency'],
        attributes: ['currency', [fn('COUNT', col('id')), 'resultCount'],
          [fn('ROUND', fn('SUM', col('grossAmount')), 2), 'grossAmount'],
          [fn('ROUND', fn('SUM', col('netAmount')), 2), 'netAmount'],
          [fn('ROUND', fn('SUM', col('employerCostsAmount')), 2), 'employerCostsAmount']],
      });
      return rows.map(reportRow);
    }
    const taxes = reportCode === 'RPT-TAX-001' || reportCode === 'RPT-TAX-003';
    const rows = await PayrollEmployeeResultModel.findAll({
      where: where as WhereOptions,
      attributes: [
        'id',
        'runId',
        'employeeId',
        'grossAmount',
        'deductionsAmount',
        'netAmount',
        'employerCostsAmount',
        'currency',
        ...(taxes ? ['calculationSnapshot'] : []),
      ],
      limit: Math.min(Number(filters.limit || 1000), 5000),
      order: [['runId', 'ASC'], ['employeeId', 'ASC'], ['id', 'ASC']],
      transaction,
    });
    return rows.map(model => {
      const row = reportRow(model);
      if (!taxes) return row;
      const snapshot = row.calculationSnapshot as { legalRuleSetVersion?: string; lines?: { code: string; amount: string }[] } | undefined;
      const amount = (code: string) => Array.isArray(snapshot?.lines)
        ? money(snapshot.lines.filter(line => line.code === code).reduce((total, line) => total + cents(line.amount), 0n))
        : null;
      const base = { runId: row.runId, employeeId: row.employeeId, currency: row.currency, legalRuleSetVersion: snapshot?.legalRuleSetVersion ?? null };
      return reportCode === 'RPT-TAX-001' ? { ...base, irt: amount('IRT') }
        : { ...base, employeeInss: amount('INSS_EMPLOYEE'), employerInss: amount('INSS_EMPLOYER') };
    });
  }
  private withTenant<T>(
    companyId: number,
    fn: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    return sequelize.transaction(async (transaction) => {
      if (sequelize.getDialect() === 'postgres')
        await sequelize.query("SELECT set_config('app.current_tenant', :tenant, true)", {
          replacements: { tenant: String(companyId) },
          type: QueryTypes.SELECT,
          transaction,
        });
      return fn(transaction);
    });
  }
}
