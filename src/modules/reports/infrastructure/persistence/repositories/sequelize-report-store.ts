import { SequelizeRecordStore } from '../../../../../shared/infrastructure/persistence/sequelize-record-store';
import { ReportRecordView } from '../../../application/ports/report-source.port';
import { ReportsRecordModel } from '../models/reports.models';
export class SequelizeReportStore extends SequelizeRecordStore<ReportRecordView> {
  constructor() {
    super(ReportsRecordModel, 'reports');
  }
}
