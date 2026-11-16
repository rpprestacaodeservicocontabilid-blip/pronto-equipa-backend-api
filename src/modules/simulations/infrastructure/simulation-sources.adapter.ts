import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../../infra/database';
import { EmployeeModel } from '../../employees/infrastructure/persistence/models/employee.model';
import {
  PayrollRunModel,
  PayrollEmployeeResultModel,
} from '../../payroll/infrastructure/persistence/models/payroll.models';
import { PayrollSourceReaderPort } from '../../payroll/application/ports/payroll-integrations.port';
import { SimulationPeriod } from '../domain/simulation.types';
import { SimulationSourcesPort } from '../application/ports/simulation.ports';

export class SequelizeSimulationSources implements SimulationSourcesPort {
  constructor(private readonly payrollSources: PayrollSourceReaderPort) {}
  read(companyId: number, runId: string, employeeId: string, period: SimulationPeriod) {
    return this.payrollSources.read(companyId, runId, employeeId, period.startDate, period.endDate);
  }
  async selectEmployees(
    companyId: number,
    options: {
      employeeIds?: string[];
      excludeEmployeeIds?: string[];
      departmentId?: number;
      jobCategory?: string;
    },
  ): Promise<string[]> {
    return sequelize.transaction(async (transaction) => {
      await this.tenant(companyId, transaction);
      const where: any = { companyId, status: 'ACTIVE' };
      if (options.employeeIds?.length) where.id = { [Op.in]: options.employeeIds };
      if (options.departmentId) where.departmentId = options.departmentId;
      if (options.jobCategory) where.jobCategory = options.jobCategory;
      if (options.excludeEmployeeIds?.length)
        where.id = { ...(where.id || {}), [Op.notIn]: options.excludeEmployeeIds };
      const employees = await EmployeeModel.findAll({
        where,
        attributes: ['id'],
        order: [['id', 'ASC']],
        limit: 501,
        transaction,
      });
      if (employees.length > 500)
        throw Object.assign(
          new Error('A simulação colectiva está limitada a 500 trabalhadores por execução.'),
          { statusCode: 400 },
        );
      return employees.map((row) => row.id);
    });
  }
  async officialResults(companyId: number, payrollRunId: string) {
    return sequelize.transaction(async (transaction) => {
      await this.tenant(companyId, transaction);
      const run = await PayrollRunModel.findOne({
        where: { companyId, id: payrollRunId, status: 'CLOSED' },
        transaction,
      });
      if (!run)
        throw Object.assign(
          new Error('A comparação requer uma folha oficial encerrada da mesma empresa.'),
          { statusCode: 404 },
        );
      const rows = await PayrollEmployeeResultModel.findAll({
        where: { companyId, runId: payrollRunId },
        attributes: [
          'employeeId',
          'grossAmount',
          'deductionsAmount',
          'netAmount',
          'employerCostsAmount',
          'currency',
        ],
        transaction,
      });
      return rows.map((row) => row.get({ plain: true }));
    });
  }
  private async tenant(companyId: number, transaction: any) {
    if (sequelize.getDialect() === 'postgres')
      await sequelize.query("SELECT set_config('app.current_tenant', :tenant, true)", {
        replacements: { tenant: String(companyId) },
        type: QueryTypes.SELECT,
        transaction,
      });
  }
}
