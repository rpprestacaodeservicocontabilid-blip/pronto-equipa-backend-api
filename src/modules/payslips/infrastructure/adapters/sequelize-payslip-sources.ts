import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../../infra/database';
import { RecordStoreContext } from '../../../../shared/application/ports/record-store.port';
import {
  SequelizeRecordStore,
  resolveRecordTransaction,
} from '../../../../shared/infrastructure/persistence/sequelize-record-store';
import { EmployeeModel } from '../../../employees/infrastructure/persistence/models/employee.model';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import {
  PayrollEmployeeResultModel,
  PayrollRunModel,
  PayrollPeriodModel,
} from '../../../payroll/infrastructure/persistence/models/payroll.models';
import {
  PayslipSourcesPort,
  PayslipPayrollResult,
  PayslipPayrollRun,
} from '../../application/ports/payslip-persistence.port';

export class SequelizePayslipSources implements PayslipSourcesPort {
  readonly results = new SequelizeRecordStore<PayslipPayrollResult>(
    PayrollEmployeeResultModel,
    'payslips',
  );
  readonly runs = new SequelizeRecordStore<PayslipPayrollRun>(PayrollRunModel, 'payslips');
  readonly periods = new SequelizeRecordStore<{
    id: string;
    companyId: number;
    startDate: string;
    endDate: string;
  }>(PayrollPeriodModel, 'payslips');
  readonly employees = new SequelizeRecordStore<{
    id: string;
    companyId: number;
    firstName: string;
    lastName: string;
    employeeNumber: string;
    departmentId: number | null;
    jobTitle: string | null;
  }>(EmployeeModel, 'payslips');

  async company(companyId: number, context: RecordStoreContext) {
    const row = await CompanyModel.findByPk(companyId, {
      transaction: resolveRecordTransaction(context),
    });
    return row ? { id: row.id, name: row.name, nif: row.nif } : null;
  }

  async hasActiveMembership(companyId: number, userId: number, context: RecordStoreContext) {
    const quote = sequelize.getDialect() === 'postgres' ? '"' : '`';
    const rows = await sequelize.query(
      `SELECT id FROM company_members WHERE ${quote}companyId${quote} = :companyId AND ${quote}userId${quote} = :userId AND status = 'ACTIVE' LIMIT 1`,
      {
        replacements: { companyId, userId },
        type: QueryTypes.SELECT,
        transaction: resolveRecordTransaction(context),
      },
    );
    return rows.length > 0;
  }
}
