export const reportCodes = ['REPORT_ACTIVITY', 'DOMAIN_USAGE', 'PAYSLIP_ACTIVITY', 'ONBOARDING_ACTIVITY', 'PAYROLL_ACTIVITY', 'PAYMENT_ACTIVITY'] as const;
export type PlatformReportCode = typeof reportCodes[number];
export const groupings = ['day', 'month'] as const;
export const formats = ['CSV', 'XLSX', 'PDF'] as const;
export const cadences = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type ReportFormat = typeof formats[number];
export type Cadence = typeof cadences[number];
export type ReportScope = { from: string; to: string; companyId?: number; grouping: typeof groupings[number] };
export interface Observation { period: string; category: string; state: string; count: number }

export const platformReportCatalog = {
  REPORT_ACTIVITY: { title: 'Report activity', category: 'Reporting', companyFilter: true, source: 'Reports registry', description: 'Counts report executions, exports, templates and schedules registered in each company.' },
  DOMAIN_USAGE: { title: 'Report usage by domain', category: 'Reporting', companyFilter: true, source: 'Reports registry and system catalogue', description: 'Groups recorded company report executions by their source domain.' },
  PAYSLIP_ACTIVITY: { title: 'Payslip operations', category: 'Payroll operations', companyFilter: true, source: 'Payslip supervision', description: 'Counts payroll documents by creation period, type and current status.' },
  ONBOARDING_ACTIVITY: { title: 'Company onboarding', category: 'Company operations', companyFilter: false, source: 'Onboarding activity', description: 'Counts new applications by registration period across the platform.' },
  PAYROLL_ACTIVITY: { title: 'Payroll operations', category: 'Payroll operations', companyFilter: true, source: 'Payroll audit trail', description: 'Counts recorded payroll workflow events by operation.' },
  PAYMENT_ACTIVITY: { title: 'Payment operations', category: 'Payroll operations', companyFilter: true, source: 'Payments audit trail', description: 'Counts recorded payment workflow events by operation.' },
} satisfies Record<PlatformReportCode, { title: string; category: string; companyFilter: boolean; source: string; description: string }>;

export const catalogue = () => reportCodes.map(code => ({ code, ...platformReportCatalog[code], version: 1 }));
export const defaultReportPolicy = { version: 1, maxDays: 366, exportHours: 24 };
const day = 86400000;
const luanda = 3600000;
export const dateOnly = (time: number) => new Date(time).toISOString().slice(0, 10);
const localDay = (time: Date) => Date.parse(dateOnly(time.getTime() + luanda));

export function previousScope(scope: ReportScope): ReportScope {
  const from = Date.parse(scope.from);
  const span = Date.parse(scope.to) - from + day;
  return { ...scope, from: dateOnly(from - span), to: dateOnly(from - day) };
}

// Jobs run at 06:00 Luanda time, on Mondays and month starts for the longer cadences.
export function nextReportDue(cadence: Cadence, after: Date) {
  const midnight = localDay(after);
  const today = new Date(midnight);
  let candidate = midnight + 5 * 3600000;
  if (cadence === 'WEEKLY') {
    candidate += (8 - today.getUTCDay()) % 7 * day;
    if (candidate <= after.getTime()) candidate += 7 * day;
  } else if (cadence === 'MONTHLY') {
    candidate = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + (today.getUTCDate() !== 1 || candidate <= after.getTime() ? 1 : 0), 1, 5);
  } else if (candidate <= after.getTime()) candidate += day;
  return new Date(candidate);
}

export function scheduledScope(cadence: Cadence, due: Date, companyId: number | undefined, grouping: ReportScope['grouping']): ReportScope {
  const boundary = localDay(due);
  const date = new Date(boundary);
  const start = cadence === 'MONTHLY'
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)
    : boundary - (cadence === 'WEEKLY' ? 7 : 1) * day;
  return { from: dateOnly(start), to: dateOnly(boundary - day), companyId, grouping };
}
