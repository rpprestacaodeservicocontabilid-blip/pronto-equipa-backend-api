import { SequelizeRecordStore } from '../../../../../shared/infrastructure/persistence/sequelize-record-store';
import { BillingRecordView } from '../../../application/ports/billing-store.port';
import { BillingRecord } from '../models/billing-record.model';
export class SequelizeBillingStore extends SequelizeRecordStore<BillingRecordView> {
  constructor() {
    super(BillingRecord, 'platform-billing');
  }
}
