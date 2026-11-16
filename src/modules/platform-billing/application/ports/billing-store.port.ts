import {
  RecordStorePort,
  StoredRecord,
} from '../../../../shared/application/ports/record-store.port';
export interface BillingRecordView extends StoredRecord {
  companyId: number;
}
export type BillingStorePort = RecordStorePort<BillingRecordView>;
export interface BillingDocumentRendererPort {
  render(data: Record<string, any>, kind: string): Buffer;
}
