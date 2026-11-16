import {
  PayslipPersistencePort,
  PayslipRecord,
  PayslipCollection,
} from '../../../application/ports/payslip-persistence.port';
import { SequelizeRecordCollections } from '../../../../../shared/infrastructure/persistence/sequelize-record-collections';
import {
  EmployeeUserLinkModel,
  PayslipAccessLogModel,
  PayslipBatchItemModel,
  PayslipBatchModel,
  PayslipCorrectionModel,
  PayslipDeliveryModel,
  PayslipDocumentModel,
  PayslipModel,
  PayslipOutboxModel,
  PayslipPolicyModel,
  PayslipPublicationModel,
  PayslipTemplateModel,
  PayslipTemplateVersionModel,
} from '../models/payslips.models';
export class SequelizePayslipPersistence
  extends SequelizeRecordCollections<PayslipRecord, PayslipCollection>
  implements PayslipPersistencePort
{
  constructor() {
    super(
      {
        employeeUserLink: EmployeeUserLinkModel,
        payslipAccessLog: PayslipAccessLogModel,
        payslipBatchItem: PayslipBatchItemModel,
        payslipBatch: PayslipBatchModel,
        payslipCorrection: PayslipCorrectionModel,
        payslipDelivery: PayslipDeliveryModel,
        payslipDocument: PayslipDocumentModel,
        payslip: PayslipModel,
        payslipOutbox: PayslipOutboxModel,
        payslipPolicy: PayslipPolicyModel,
        payslipPublication: PayslipPublicationModel,
        payslipTemplate: PayslipTemplateModel,
        payslipTemplateVersion: PayslipTemplateVersionModel,
      },
      'payslips',
    );
  }
}
