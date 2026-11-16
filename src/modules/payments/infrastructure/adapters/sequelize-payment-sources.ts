import { PaymentSourcesPort } from '../../application/ports/payment-persistence.port';
import {
  PayrollResultRecord,
  PayrollRunRecord,
} from '../../../payroll/application/ports/payroll-persistence.port';
import {
  PayrollEmployeeResultModel,
  PayrollRunModel,
} from '../../../payroll/infrastructure/persistence/models/payroll.models';
import { AuditLogModel } from '../../../audit/infrastructure/persistence/models/audit-log.model';
import { RecordQuery } from '../../../../shared/application/ports/record-store.port';
import { SequelizeRecordStore } from '../../../../shared/infrastructure/persistence/sequelize-record-store';

export class SequelizePaymentSources implements PaymentSourcesPort {
  readonly results = new SequelizeRecordStore<PayrollResultRecord>(
    PayrollEmployeeResultModel,
    'payments',
  );
  readonly runs = new SequelizeRecordStore<PayrollRunRecord>(PayrollRunModel, 'payments');
  readonly history = {
    findAll: async (query: RecordQuery) =>
      (await AuditLogModel.findAll({ where: query.where, order: query.order })).map((row) => ({
        action: row.action,
        actorUserId: row.actorUserId,
        createdAt: row.createdAt,
        before: row.before,
        after: row.after,
      })),
  };
}
