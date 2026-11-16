export interface PayslipDocumentStorage {
  put(companyId: number, payslipId: string, bytes: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export type RenderSnapshot = {
  employer: { name: string; taxId: string; address?: string | null };
  employee: {
    fullName: string;
    employeeCode: string;
    taxId?: string | null;
    department?: string | null;
    jobTitle?: string | null;
  };
  period: { startDate: string; endDate: string };
  earnings: Array<{ code: string; description: string; amount: string }>;
  deductions: Array<{ code: string; description: string; amount: string }>;
  grossAmount: string;
  totalDeductions: string;
  netAmount: string;
  employerCostsAmount: string;
  currency: string;
  payslipNumber: string;
  issuedAt: string;
  verificationCode: string;
  copyLabel?: string;
  template: Record<string, unknown>;
};
export interface PayslipRendererPort {
  render(snapshot: RenderSnapshot): Buffer;
}
export interface PayslipReportRendererPort {
  pdf(rows: string[][]): Buffer;
  xlsx(rows: string[][]): Buffer;
}
