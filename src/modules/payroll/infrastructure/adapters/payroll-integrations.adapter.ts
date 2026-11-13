import { Op, QueryTypes } from 'sequelize';
import { z } from 'zod';
import { sequelize } from '../../../../infra/database';
import { AppError, ValidationError } from '../../../../shared/errors/app.error';
import {
  PayrollCalculatorPort,
  PayrollInputSnapshot,
} from '../../application/ports/payroll-calculator.port';
import {
  PayrollLegalRulesPort,
  PayrollSourceReaderPort,
} from '../../application/ports/payroll-integrations.port';
import { validateCalculation } from '../../domain/payroll-result';
import { EmployeeModel } from '../../../employees/infrastructure/persistence/model/employee.model';
import { EmploymentContractModel } from '../../../contracts/infrastructure/persistence/model/employment-contract.model';
import { SequelizeSalaryStructureRepository } from '../../../salary-structure/infrastructure/persistence/repositories/sequelize-salary-structure.repository';
import { EmployeeSalaryAssignmentModel } from '../../../salary-structure/infrastructure/persistence/model/salary-structure.models';
import { AttendanceEntityModel } from '../../../attendance/infrastructure/persistence/model/attendance-entity.model';
import { LeaveRequestModel } from '../../../leave/infrastructure/persistence/model/leave-request.model';
import { EmployeeLoanModel } from '../../../loans/infrastructure/persistence/model/employee-loan.model';
import { LoanInstallmentModel } from '../../../loans/infrastructure/persistence/model/loan-installment.model';
import { LoanLedgerEntryModel } from '../../../loans/infrastructure/persistence/model/loan-ledger-entry.model';
import { LoanDeductionModel } from '../../../loans/infrastructure/persistence/model/loan-deduction.model';

// URLs and credentials are operator configuration; no URL comes from a tenant request.
async function request(url: string | undefined, path: string, body: unknown): Promise<unknown> {
  if (!url)
    throw new AppError(
      'Payroll integration is not configured.',
      503,
      'PAYROLL_INTEGRATION_UNAVAILABLE',
    );
  const base = new URL(url);
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/`;
  base.search = '';
  base.hash = '';
  const endpoint = new URL(path.replace(/^\/+/, ''), base);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.PAYROLL_INTEGRATION_TOKEN
        ? { Authorization: `Bearer ${process.env.PAYROLL_INTEGRATION_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new AppError(
      'Payroll integration request failed.',
      503,
      'PAYROLL_INTEGRATION_UNAVAILABLE',
    );
  return response.json();
}
export class HttpPayrollCalculator implements PayrollCalculatorPort {
  async calculate(input: PayrollInputSnapshot) {
    return validateCalculation(await request(process.env.PAYROLL_ENGINE_URL, '/calculate', input));
  }
}
export class HttpPayrollLegalRules implements PayrollLegalRulesPort {
  async resolve(companyId: number, startDate: string, endDate: string) {
    return z
      .object({ version: z.string().min(1), ruleSetId: z.string().min(1).optional(), sourceReference: z.string().min(1).optional(), integrityHash: z.string().min(1).optional(), status: z.literal('PUBLISHED'), effectiveFrom: z.string(), effectiveTo: z.string().nullable(), rules: z.record(z.string(), z.unknown()) })
      .refine(value => value.effectiveFrom <= startDate && (value.effectiveTo === null || value.effectiveTo >= endDate), 'Published rules must cover the calculation period.')
      .parse(
        await request(process.env.PAYROLL_LEGAL_RULES_URL, '/resolve', {
          companyId,
          startDate,
          endDate,
        }),
      );
  }
}
export class SequelizePayrollSourceReader implements PayrollSourceReaderPort {
  constructor(private readonly legal: PayrollLegalRulesPort) {}
  async read(
    companyId: number,
    payrollRunId: string,
    employeeId: string,
    startDate: string,
    endDate: string,
  ) {
    const legal = await this.legal.resolve(companyId, startDate, endDate);
    const history = await sequelize.transaction(async (transaction) => {
      if (sequelize.getDialect() === 'postgres')
        await sequelize.query("SELECT set_config('app.current_tenant', :id, true)", {
          replacements: { id: String(companyId) },
          type: QueryTypes.SELECT,
          transaction,
        });
      const contracts = await EmploymentContractModel.findAll({
        where: {
          companyId,
          employeeId,
          startDate: { [Op.lte]: endDate },
          [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: startDate } }],
          status: { [Op.in]: ['ACTIVE', 'TERMINATED', 'EXPIRED', 'SUSPENDED'] },
        },
        order: [['startDate', 'ASC']],
        transaction,
      });
      const assignments = await EmployeeSalaryAssignmentModel.findAll({
        where: {
          companyId,
          employeeId,
          effectiveFrom: { [Op.lte]: endDate },
          [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: startDate } }],
          status: 'ACTIVE',
        },
        order: [['effectiveFrom', 'ASC']],
        transaction,
      });
      return { contracts, assignments };
    });
    if (!history.contracts.length || !history.assignments.length)
      throw new ValidationError('No historical employment and salary data for this period.');
    const nextDay = (value: string) => {
      const date = new Date(`${value}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + 1);
      return date.toISOString().slice(0, 10);
    };
    const previousDay = (value: string) => {
      const date = new Date(`${value}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - 1);
      return date.toISOString().slice(0, 10);
    };
    const boundaries = new Set([startDate, nextDay(endDate)]);
    for (const contract of history.contracts) {
      if (contract.startDate > startDate) boundaries.add(contract.startDate);
      if (contract.endDate && contract.endDate < endDate) boundaries.add(nextDay(contract.endDate));
    }
    for (const assignment of history.assignments) {
      if (assignment.effectiveFrom > startDate) boundaries.add(assignment.effectiveFrom);
      if (assignment.effectiveTo && assignment.effectiveTo < endDate)
        boundaries.add(nextDay(assignment.effectiveTo));
    }
    const dates = [...boundaries].sort();
    const segments: Array<Record<string, unknown>> = [];
    for (let index = 0; index < dates.length - 1; index++) {
      const from = dates[index],
        to = previousDay(dates[index + 1]);
      const contracts = history.contracts.filter(
        (contract) => contract.startDate <= from && (!contract.endDate || contract.endDate >= to),
      );
      if (!contracts.length) continue; // Admission, termination and employment gaps are explicit segments, not full-month salary.
      const contract = contracts[0];
      const assignments = history.assignments.filter(
        (assignment) =>
          assignment.contractId === contract.id &&
          assignment.effectiveFrom <= from &&
          (!assignment.effectiveTo || assignment.effectiveTo >= to),
      );
      if (contracts.length !== 1 || assignments.length !== 1)
        throw new ValidationError('Ambiguous or missing salary history within the period.');
      const salary = await new SequelizeSalaryStructureRepository().resolveSnapshot(
        companyId,
        employeeId,
        from,
      );
      if (salary.assignmentId !== assignments[0].id)
        throw new ValidationError('Salary snapshot does not match the historical contract.');
      segments.push({
        startDate: from,
        endDate: to,
        contract: contract.toJSON(),
        salary: salary.toJSON(),
      });
    }
    if (!segments.length) throw new ValidationError('No eligible employment segments.');
    const data = await sequelize.transaction(async (transaction) => {
      if (sequelize.getDialect() === 'postgres')
        await sequelize.query("SELECT set_config('app.current_tenant', :id, true)", {
          replacements: { id: String(companyId) },
          type: QueryTypes.SELECT,
          transaction,
        });
      const employee = await EmployeeModel.findOne({
        where: { companyId, id: employeeId },
        transaction,
      });
      if (!employee) throw new ValidationError('Employee not found in company.');
      const attendancePeriod = await AttendanceEntityModel.findOne({
        where: {
          companyId,
          type: 'PERIOD',
          status: 'CLOSED',
          periodStart: { [Op.lte]: startDate },
          periodEnd: { [Op.gte]: endDate },
        },
        transaction,
      });
      const attendance = attendancePeriod
        ? await AttendanceEntityModel.findOne({
            where: { companyId, type: 'SNAPSHOT', parentId: attendancePeriod.id },
            order: [['createdAt', 'DESC']],
            transaction,
          })
        : null;
      if (!attendance) throw new ValidationError('A closed attendance snapshot is required.');
      const leave = await LeaveRequestModel.findAll({
        where: {
          companyId,
          employeeId,
          startDate: { [Op.lte]: endDate },
          endDate: { [Op.gte]: startDate },
          status: { [Op.in]: ['APPROVED', 'IN_PROGRESS', 'COMPLETED'] },
        },
        transaction,
      });
      const loans = await EmployeeLoanModel.findAll({
        where: { companyId, employeeId, status: 'ACTIVE' },
        transaction,
      });
      const installments = loans.length
        ? await LoanInstallmentModel.findAll({
            where: {
              companyId,
              loanId: { [Op.in]: loans.map((loan) => loan.id) },
              dueDate: { [Op.between]: [startDate, endDate] },
              status: { [Op.in]: ['PENDING', 'PARTIALLY_PAID'] },
            },
            transaction,
          })
        : [];
      const days = Array.isArray(attendance.data.days)
        ? attendance.data.days.filter(
            (day: Record<string, unknown>) =>
              day.employeeId === employeeId &&
              String(day.workDate) >= startDate &&
              String(day.workDate) <= endDate,
          )
        : [];
      const loanIds = loans.map(loan => loan.id);
      const ledger = loanIds.length ? await LoanLedgerEntryModel.findAll({ where: { companyId, loanId: { [Op.in]: loanIds } }, transaction }) : [];
      const deductions = loanIds.length ? await LoanDeductionModel.findAll({ where: { companyId, loanId: { [Op.in]: loanIds }, status: 'REQUESTED', [Op.or]: [{ payrollRunId: null }, { payrollRunId }] }, transaction }) : [];
      return {
        employee: employee.toJSON(),
        segments,
        attendance: { id: attendance.id, version: attendance.version, days },
        leave: leave.map((row) => row.toJSON()),
        loans: loans.map((row) => row.toJSON()),
        installments: installments.map((row) => row.toJSON()),
        loanLedger: ledger.map(row => row.toJSON()),
        loanDeductions: deductions.map(row => row.toJSON()),
        legalRules: {
          ...legal.rules,
          ruleSetId: legal.ruleSetId ?? String(legal.rules.ruleSetId ?? legal.version),
          version: legal.version,
          status: legal.status,
          jurisdiction: 'AO',
          effectiveFrom: legal.effectiveFrom,
          effectiveTo: legal.effectiveTo,
          sourceReference: legal.sourceReference ?? String(legal.rules.sourceReference ?? ''),
          ...(legal.integrityHash ? { integrityHash: legal.integrityHash } : {}),
        },
      };
    });
    return {
      companyId,
      payrollRunId,
      employeeId,
      period: { startDate, endDate },
      salarySnapshotId: segments
        .map((segment) => String((segment.salary as { id: string }).id))
        .join(','),
      contractSnapshotId: history.contracts
        .map((contract) => `${contract.id}:${contract.version}`)
        .join(','),
      legalRuleSetVersion: legal.version,
      data,
    };
  }
}
