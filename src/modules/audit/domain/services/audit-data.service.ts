import {
  AuditEventInput,
  auditCategories,
  auditFailure,
  auditScope,
  auditText,
  auditData,
} from '../audit-contracts';
const secret =
  /password|passwd|token|secret|authorization|cookie|apikey|credential|privatekey|otp|pincode|accountnumber|accountidentifier|accountciphertext|iban|beneficiarysnapshot/i;
const sensitive =
  /salary|remuneration|gross|netamount|deduction|bank|taxid|nif|email|phone|birth|address|amount|fullname|firstname|lastname|identitynumber|documentnumber/i;
export function auditModule(resource: string, eventType: string): string {
  const groups: Array<[RegExp, string]> = [
    [/^payroll_payment|^payment_/, 'payments'],
    [/^employee_salary|^salary_/, 'salary-structure'],
    [/^payroll_/, 'payroll'],
    [/^payslip/, 'payslips'],
    [/^platform_billing/, 'platform-billing'],
    [/^subscription|^tenant_subscription/, 'subscriptions'],
    [/^employment_contract|^contract/, 'contracts'],
    [/^employee_loan|^loan_/, 'loans'],
    [/^employee/, 'employees'],
    [/^role|^user_role|^user_permission/, 'authorization'],
    [/^compan/, 'tenancy'],
    [/^auth_|^user$/, 'identity'],
    [/^legal_/, 'legal-rules'],
    [/^document/, 'documents'],
    [/^simulation/, 'simulations'],
    [/^report/, 'reports'],
    [/^onboarding/, 'onboarding'],
    [/^support/, 'support'],
    [/^organization/, 'organization'],
    [/^leave/, 'leave'],
    [/^attendance/, 'attendance'],
  ];
  const match = groups.find(([pattern]) => pattern.test(resource.toLowerCase()));
  return (
    match?.[1] ||
    eventType
      .split('.')[0]
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 64) ||
    'application'
  );
}
export function canonicalAudit(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${Array.from(value, canonicalAudit).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row)
      .filter((k) => row[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalAudit(row[k])}`)
      .join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value))
    throw auditFailure('Non-finite audit number.');
  if (['string', 'number', 'boolean'].includes(typeof value)) return JSON.stringify(value);
  throw auditFailure('Unsupported audit data.');
}
export function redactAudit(
  value: unknown,
  protectSensitive = false,
  field = '',
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (secret.test(field.replace(/[^a-z0-9]/gi, '')) || (protectSensitive && sensitive.test(field)))
    return '[REDACTED]';
  if (depth > 16) throw auditFailure('Audit payload nesting exceeds limit.');
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    if (value.length > 16000) throw auditFailure('Audit string exceeds limit.');
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw auditFailure('Invalid audit number.');
    return value;
  }
  if (typeof value === 'bigint') return String(value);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw auditFailure('Invalid audit timestamp.');
    return value.toISOString();
  }
  if (typeof value !== 'object') throw auditFailure('Unsupported audit value.');
  if (seen.has(value)) throw auditFailure('Cyclic audit payload.');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > 2000) throw auditFailure('Audit list exceeds limit.');
      return Array.from(value, (v) => redactAudit(v, protectSensitive, field, depth + 1, seen));
    }
    const entries = Object.entries(value);
    if (entries.length > 1000) throw auditFailure('Audit object exceeds limit.');
    return Object.fromEntries(
      entries.map(([key, item]) => [
        key,
        redactAudit(item, protectSensitive, key, depth + 1, seen),
      ]),
    );
  } finally {
    seen.delete(value);
  }
}
export function normalizeAudit(input: AuditEventInput, now: Date): AuditEventInput {
  if (input.metadata !== undefined) auditData(input.metadata);
  const companyId = input.scope === 'TENANT' ? Number(input.tenantId) : null;
  if (
    !['TENANT', 'PLATFORM'].includes(input.scope) ||
    (input.scope === 'TENANT' && !input.tenantId) ||
    (input.scope === 'PLATFORM' && input.tenantId)
  )
    throw auditFailure('Audit scope and tenant are incompatible.');
  auditScope(companyId);
  if (
    !auditCategories.includes(input.category) ||
    !['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(input.severity) ||
    !['SUCCESS', 'FAILURE', 'DENIED', 'PARTIAL', 'CANCELLED'].includes(input.outcome)
  )
    throw auditFailure('Invalid audit classification.');
  if (!['USER', 'SERVICE', 'SYSTEM', 'EXTERNAL'].includes(input.actor.actorType))
    throw auditFailure('Invalid audit actor.');
  if (input.actor.actorType !== 'EXTERNAL' && !input.actor.actorId)
    throw auditFailure('Identified audit actor required.');
  if (input.sensitivity !== undefined && !['STANDARD', 'SENSITIVE'].includes(input.sensitivity))
    throw auditFailure('Invalid audit sensitivity.');
  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > now.getTime() + 300000)
    throw auditFailure('Invalid audit occurrence time.');
  const normalized: AuditEventInput = {
    module: auditText(
      input.module || auditModule(input.resource.resourceType, input.eventType),
      'module',
      80,
    ),
    category: input.category,
    severity: input.severity,
    outcome: input.outcome,
    sensitivity: input.sensitivity,
    correlationId: input.correlationId,
    causationId: input.causationId,
    requestId: input.requestId,
    reason: input.reason,
    eventId: auditText(input.eventId, 'event id'),
    sourceId: auditText(input.sourceId, 'source'),
    eventType: auditText(input.eventType, 'event type'),
    action: auditText(input.action, 'action'),
    scope: input.scope,
    tenantId: companyId === null ? undefined : String(companyId),
    actor: {
      actorType: input.actor.actorType,
      actorId: input.actor.actorId ? auditText(input.actor.actorId, 'actor') : undefined,
      sessionId: input.actor.sessionId ? auditText(input.actor.sessionId, 'session') : undefined,
    },
    resource: {
      resourceType: auditText(input.resource.resourceType, 'resource type'),
      resourceId: auditText(input.resource.resourceId, 'resource id'),
      resourceVersion: input.resource.resourceVersion
        ? auditText(input.resource.resourceVersion, 'resource version')
        : undefined,
    },
    occurredAt: occurredAt.toISOString(),
    metadata: redactAudit(input.metadata || {}, true) as Record<string, unknown>,
    changes:
      input.changes === undefined
        ? undefined
        : Array.from(input.changes, (change) => ({
            field: auditText(change.field, 'change path', 500),
            before: redactAudit(change.before, true, change.field),
            after: redactAudit(change.after, true, change.field),
          })),
  };
  for (const key of ['correlationId', 'causationId', 'requestId', 'reason'] as const)
    if (normalized[key] !== undefined)
      normalized[key] = auditText(normalized[key], key, key === 'reason' ? 2000 : 200);
  if ((normalized.changes?.length || 0) > 500 || canonicalAudit(normalized).length > 262144)
    throw auditFailure('Audit payload exceeds limit.');
  return normalized;
}

/** Changed fields retain their names while protected values remain masked. */
export function auditChanges(
  before: unknown,
  after: unknown,
): NonNullable<AuditEventInput['changes']> {
  const previous =
    before && typeof before === 'object' && !Array.isArray(before)
      ? (redactAudit(before) as Record<string, unknown>)
      : {};
  const next =
    after && typeof after === 'object' && !Array.isArray(after)
      ? (redactAudit(after) as Record<string, unknown>)
      : {};
  const changes: NonNullable<AuditEventInput['changes']> = [];
  for (const field of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    const left = previous[field] ?? null,
      right = next[field] ?? null;
    if (canonicalAudit(left) !== canonicalAudit(right))
      changes.push({
        field,
        before: redactAudit(left, true, field),
        after: redactAudit(right, true, field),
      });
    if (changes.length > 500) throw auditFailure('Audit change list exceeds limit.');
  }
  return changes;
}
