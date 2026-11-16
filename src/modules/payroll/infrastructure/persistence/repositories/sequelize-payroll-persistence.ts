import {
  PayrollPersistencePort,
  PayrollWorkflowRecord,
  PayrollWorkflowCollection,
  PayrollRunRecord,
  PayrollPeriodRecord,
  PayrollResultRecord,
  PayrollInputRecord,
  PayrollOutboxRecord,
} from '../../../application/ports/payroll-persistence.port';
import { RecordQuery } from '../../../../../shared/application/ports/record-store.port';
import { SequelizeRecordCollections } from '../../../../../shared/infrastructure/persistence/sequelize-record-collections';
import {
  SequelizeRecordStore,
  resolveRecordTransaction,
} from '../../../../../shared/infrastructure/persistence/sequelize-record-store';
import { EmployeeModel } from '../../../../employees/infrastructure/persistence/models/employee.model';
import { LoanDeductionModel } from '../../../../loans/infrastructure/persistence/models/loan-deduction.model';
import {
  PayrollRunModel,
  PayrollPeriodModel,
  PayrollEmployeeResultModel,
  PayrollInputSnapshotModel,
  PayrollOutboxModel,
} from '../models/payroll.models';
import {
  PayrollAdjustment,
  PayrollApproval,
  PayrollBatch,
  PayrollCalculation,
  PayrollClosing,
  PayrollInstruction,
  PayrollIssue,
  PayrollItem,
  PayrollLine,
  PayrollPolicy,
  PayrollExport,
} from '../models/payroll-workflow.models';
export class SequelizePayrollPersistence
  extends SequelizeRecordCollections<PayrollWorkflowRecord, PayrollWorkflowCollection>
  implements PayrollPersistencePort
{
  readonly runs = new SequelizeRecordStore<PayrollRunRecord>(PayrollRunModel, 'payroll');
  readonly periods = new SequelizeRecordStore<PayrollPeriodRecord>(PayrollPeriodModel, 'payroll');
  readonly results = new SequelizeRecordStore<PayrollResultRecord>(
    PayrollEmployeeResultModel,
    'payroll',
  );
  readonly inputs = new SequelizeRecordStore<PayrollInputRecord>(
    PayrollInputSnapshotModel,
    'payroll',
  );
  readonly outbox = new SequelizeRecordStore<PayrollOutboxRecord>(PayrollOutboxModel, 'payroll');
  constructor() {
    super(
      {
        payrollAdjustment: PayrollAdjustment,
        payrollApproval: PayrollApproval,
        payrollBatch: PayrollBatch,
        payrollCalculation: PayrollCalculation,
        payrollClosing: PayrollClosing,
        payrollInstruction: PayrollInstruction,
        payrollIssue: PayrollIssue,
        payrollItem: PayrollItem,
        payrollLine: PayrollLine,
        payrollPolicy: PayrollPolicy,
        payrollExport: PayrollExport,
      },
      'payroll',
    );
  }
  async employeeCount(query: RecordQuery) {
    return Number(
      await new SequelizeRecordStore<{ id: string }>(EmployeeModel, 'payroll').count(query),
    );
  }
  async releaseLoans(changes: { payrollRunId: null }, query: RecordQuery) {
    const [count] = await LoanDeductionModel.update(changes, {
      where: query.where || {},
      transaction: resolveRecordTransaction(query.transaction),
    });
    return count;
  }
}
