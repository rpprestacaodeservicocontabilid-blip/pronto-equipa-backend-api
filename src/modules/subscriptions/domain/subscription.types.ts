export type SubscriptionStatus =
  | 'PENDING_PAYMENT'
  | 'TRIALING'
  | 'ACTIVE'
  | 'GRACE_PERIOD'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'EXPIRED';
export type PlanStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type BillingInterval = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'CUSTOM';
export type UsageMetric =
  | 'ACTIVE_EMPLOYEES'
  | 'ACTIVE_USERS'
  | 'STORAGE_BYTES'
  | 'PAYROLL_EMPLOYEES_PER_PERIOD'
  | 'DOCUMENT_UPLOAD_BYTES'
  | 'REPORT_EXPORTS'
  | 'SIMULATION_RUNS'
  | 'API_REQUESTS'
  | 'COMPANIES'
  | 'ORGANIZATIONAL_UNITS';
export const SUBSCRIPTION_PERMISSIONS = {
  read: 'subscriptions:read',
  plansRead: 'subscriptions:plans:read',
  plansCreate: 'subscriptions:plans:create',
  plansUpdate: 'subscriptions:plans:update',
  plansPublish: 'subscriptions:plans:publish',
  plansArchive: 'subscriptions:plans:archive',
  tenantRead: 'subscriptions:tenant:read',
  tenantCreate: 'subscriptions:tenant:create',
  tenantCancel: 'subscriptions:tenant:cancel',
  tenantReactivate: 'subscriptions:tenant:reactivate',
  changesCreate: 'subscriptions:changes:create',
  changesRead: 'subscriptions:changes:read',
  changesApprove: 'subscriptions:changes:approve',
  changesReject: 'subscriptions:changes:reject',
  usageRead: 'subscriptions:usage:read',
  limitsRead: 'subscriptions:limits:read',
  entitlementsRead: 'subscriptions:entitlements:read',
  trialsManage: 'subscriptions:trials:manage',
  overridesManage: 'subscriptions:overrides:manage',
  suspend: 'subscriptions:suspend',
  reactivate: 'subscriptions:reactivate',
  reportsRead: 'subscriptions:reports:read',
  historyRead: 'subscriptions:history:read',
  policiesManage: 'subscriptions:policies:manage',
} as const;
export const SUBSCRIPTION_METRICS: UsageMetric[] = [
  'ACTIVE_EMPLOYEES',
  'ACTIVE_USERS',
  'STORAGE_BYTES',
  'PAYROLL_EMPLOYEES_PER_PERIOD',
  'DOCUMENT_UPLOAD_BYTES',
  'REPORT_EXPORTS',
  'SIMULATION_RUNS',
  'API_REQUESTS',
  'COMPANIES',
  'ORGANIZATIONAL_UNITS',
];
export const SUBSCRIPTION_FEATURES = [
  'employees',
  'payroll',
  'documents',
  'reports',
  'simulations',
  'ai-assistant',
  'organization',
  'notifications',
  'support',
] as const;
export interface EntitlementDecision {
  allowed: boolean;
  reason?: string;
  entitlementVersion: string;
}
export interface SubscriptionLimit {
  limit: string | null;
  used: string;
  reserved: string;
  resetAt?: string;
}
