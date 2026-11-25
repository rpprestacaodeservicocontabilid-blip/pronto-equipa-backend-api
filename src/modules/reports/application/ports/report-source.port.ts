import { RecordStorePort } from '../../../../shared/application/ports/record-store.port';
import { ReportDefinition } from '../../domain/report-catalog';
import { ReportFilters } from '../dto/report-filters';
export interface ReportRecordView {
  id: string;
  companyId: number;
  recordType: string;
  status: string;
  ownerUserId: number | null;
  code: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
export type ReportStorePort = RecordStorePort<ReportRecordView>;
export type ReportDataRow = Record<string, unknown>;
export interface ReportSourcePort {
  dashboardData(
    companyId: number,
    filters: ReportFilters,
    includePayroll?: boolean,
  ): Promise<{ active: number; employees: number; payroll: ReportDataRow[] }>;
  readSource(
    companyId: number,
    report: ReportDefinition,
    filters: ReportFilters,
  ): Promise<ReportDataRow[]>;
}
export interface ReportRendererPort {
  pdf(table: string[][]): Buffer;
  xlsx(table: string[][]): Buffer;
}
