import { ReportDataRow } from '../../application/ports/report-source.port';

import { Op, QueryTypes, WhereOptions, Transaction, Model } from 'sequelize';

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

function reportRow(model: Model): ReportDataRow {
  const data: unknown = model.get({ plain: true });
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Invalid report projection.');
  return data as ReportDataRow;
}
export class SequelizeReportSource implements ReportSourcePort {
  async dashboardData(companyId: number, filters: ReportFilters) {
    const active = await this.withTenant(companyId, async (transaction) =>
      EmployeeModel.count({ where: { companyId, status: 'ACTIVE' }, transaction }),
    );
    const employees = await this.withTenant(companyId, async (transaction) =>
      EmployeeModel.count({ where: { companyId }, transaction }),
    );
    const payroll = await this.withTenant(companyId, (transaction) =>
      this.readPayroll(companyId, { ...filters, limit: 5000 }, transaction),
    );
    return { active, employees, payroll };
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
          where[field] = {
            ...(filters.from ? { [Op.gte]: filters.from } : {}),
            ...(filters.to ? { [Op.lte]: filters.to } : {}),
          };
        if (filters.status && report.source !== 'payroll') where.status = filters.status;
        return where as WhereOptions;
      };
      switch (report.source) {
        case 'employees': {
          const where: Record<string, unknown> = { companyId };
          if (filters.employeeId) where.id = filters.employeeId;
          if (filters.departmentId) where.departmentId = filters.departmentId;
          if (filters.status) where.status = filters.status;
          const dateField = report.code === 'RPT-HR-004' ? 'terminationDate' : 'admissionDate';
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
            where: whereFor('startDate'),
            attributes: [
              'id',
              'employeeId',
              'contractNumber',
              'typeCode',
              'status',
              'startDate',
              'endDate',
              'currency',
              'salaryAmount',
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
            where: whereFor('startDate'),
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
          return this.readPayroll(companyId, filters, transaction);
        case 'payments': {
          const model =
            report.code === 'RPT-PMT-003'
              ? PayrollPaymentReturnModel
              : report.code === 'RPT-PMT-007'
                ? PayrollPaymentTransactionModel
                : PayrollPaymentInstructionModel;
          const rows = await model.findAll({
            where: whereFor('createdAt'),
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
      where.employeeId = { [Op.in]: employeeIds };
    }
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
        'calculationSnapshot',
      ],
      limit: Math.min(Number(filters.limit || 1000), 5000),
      transaction,
    });
    return rows.map((r) => reportRow(r));
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
