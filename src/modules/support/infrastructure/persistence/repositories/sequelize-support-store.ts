import { SequelizeRecordStore } from '../../../../../shared/infrastructure/persistence/sequelize-record-store';
import { SupportRecord } from '../../../application/ports/support-ports';
import { SupportRecordRow } from '../models/support-record.model';

export class SequelizeSupportStore extends SequelizeRecordStore<SupportRecord> {
  constructor() {
    super(SupportRecordRow, 'support');
  }
}
