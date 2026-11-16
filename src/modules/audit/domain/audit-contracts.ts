export const auditCategories = [
  'ACTIVITY',
  'SECURITY',
  'ACCESS',
  'DATA_CHANGE',
  'ADMINISTRATION',
  'FINANCIAL',
  'PAYROLL',
  'DOCUMENT',
  'AUTHORIZATION',
  'INTEGRATION',
  'AUTOMATION',
  'COMPLIANCE',
  'EXPORT',
  'AI_OPERATION',
] as const;
export type AuditCategory = (typeof auditCategories)[number];
export type AuditSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED' | 'PARTIAL' | 'CANCELLED';
export type AuditSensitivity = 'STANDARD' | 'SENSITIVE';
export interface AuditEventInput {
  eventId: string;
  eventType: string;
  category: AuditCategory;
  severity: AuditSeverity;
  scope: 'TENANT' | 'PLATFORM';
  tenantId?: string;
  actor: {
    actorId?: string;
    actorType: 'USER' | 'SERVICE' | 'SYSTEM' | 'EXTERNAL';
    sessionId?: string;
  };
  action: string;
  resource: { resourceType: string; resourceId: string; resourceVersion?: string };
  outcome: AuditOutcome;
  occurredAt: string;
  sourceId: string;
  correlationId?: string;
  causationId?: string;
  requestId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  changes?: Array<{ field: string; before?: unknown; after?: unknown }>;
  sensitivity?: AuditSensitivity;
}
export interface AuditScope {
  companyId: number | null;
  scopeKey: string;
}
export interface AuditAccess extends AuditScope {
  actorId: number;
  purpose: string;
  sensitive: boolean;
  ownOnly?: boolean;
}
export interface AuditQuery {
  eventType?: string;
  category?: AuditCategory;
  severity?: AuditSeverity;
  outcome?: AuditOutcome;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  correlationId?: string;
  from?: string;
  to?: string;
  cursor?: number;
  limit?: number;
}
export interface AuditRecordView extends AuditScope {
  id: string;
  eventId: string;
  sourceId: string;
  sequence: number;
  schemaVersion: number;
  eventType: string;
  category: AuditCategory;
  severity: AuditSeverity;
  outcome: AuditOutcome;
  actorId: string | null;
  resourceType: string;
  resourceId: string;
  correlationId: string | null;
  sensitivity: AuditSensitivity;
  occurredAt: string;
  receivedAt: string;
  policyVersion: number;
  inputHash: string;
  previousHash: string;
  payloadHash: string;
  recordHash: string;
  payload: AuditEventInput;
}
export interface AuditReceipt {
  auditRecordId: string;
  sequence: number;
  recordHash: string;
  duplicate: boolean;
}
export interface AuditHead extends AuditScope {
  sequence: number;
  recordHash: string;
}
export const auditObjectKinds = [
  'INVESTIGATION',
  'EVIDENCE',
  'EXPORT',
  'POLICY',
  'RETENTION',
  'RETENTION_RUN',
  'LEGAL_HOLD',
  'ALERT_RULE',
  'ALERT',
  'CHECKPOINT',
  'INTEGRITY_RUN',
  'INGESTION_FAILURE',
  'RECONCILIATION',
  'SOURCE_CURSOR',
  'OUTBOX',
] as const;
export type AuditObjectKind = (typeof auditObjectKinds)[number];
export interface AuditObject extends AuditScope {
  id: string;
  kind: AuditObjectKind;
  key: string;
  status: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export interface AuditSignature {
  keyId: string;
  algorithm: 'Ed25519';
  signature: string;
}
export interface AuditManifest {
  schemaVersion: 1;
  scopeKey: string;
  createdAt: string;
  purpose: string;
  records: AuditRecordView[];
  recordIds: string[];
  firstSequence: number;
  lastSequence: number;
  checksum: string;
  signature: AuditSignature;
}
export const auditFailure = (message: string, statusCode = 422) =>
  Object.assign(new Error(message), { statusCode });
export function auditScope(companyId: number | null): AuditScope {
  if (companyId !== null && (!Number.isSafeInteger(companyId) || companyId <= 0))
    throw auditFailure('Invalid audit tenant.');
  return { companyId, scopeKey: companyId === null ? 'platform' : `tenant:${companyId}` };
}
export function auditText(value: unknown, name: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw auditFailure(`Invalid ${name}.`);
  return value.trim();
}
export function auditStrings(value: unknown): string[] {
  if (!Array.isArray(value)) throw auditFailure('Invalid audit list.');
  return value.map((v: unknown) => auditText(v, 'identifier', 200));
}
export function auditData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw auditFailure('Invalid audit object.');
  return value as Record<string, unknown>;
}
