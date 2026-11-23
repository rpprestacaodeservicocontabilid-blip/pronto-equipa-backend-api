import {
  AuditEventInput,
  AuditObject,
  AuditSeverity,
  AuditSensitivity,
  auditFailure,
  auditText,
} from '../audit-contracts';
export interface AuditPolicyConfiguration {
  code: string;
  eventType?: string;
  severity: AuditSeverity;
  sensitive: boolean;
  reason: string;
}
export class AuditPolicy {
  constructor(readonly record: AuditObject) {
    if (
      record.kind !== 'POLICY' ||
      !Number.isSafeInteger(Number(record.data.version)) ||
      Number(record.data.version) < 1
    )
      throw auditFailure('Invalid audit policy version.');
    AuditPolicy.configuration(record.data);
  }
  static configuration(input: Record<string, unknown>): AuditPolicyConfiguration {
    const severity = auditText(input.severity, 'policy severity') as AuditSeverity;
    if (
      !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity) ||
      typeof input.sensitive !== 'boolean'
    )
      throw auditFailure('Invalid audit policy classification.');
    return {
      code: auditText(input.code, 'policy code'),
      eventType:
        input.eventType === undefined ? undefined : auditText(input.eventType, 'event type'),
      severity,
      sensitive: input.sensitive,
      reason: auditText(input.reason, 'policy reason', 2000),
    };
  }
  get version(): number {
    return Number(this.record.data.version);
  }
  applies(event: AuditEventInput): boolean {
    return (
      this.record.status === 'ACTIVE' &&
      (!this.record.data.eventType || this.record.data.eventType === event.eventType)
    );
  }
  classify(event: AuditEventInput): { severity: AuditSeverity; sensitivity: AuditSensitivity } {
    const levels: AuditSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    return {
      severity:
        levels[
          Math.max(
            levels.indexOf(event.severity),
            levels.indexOf(this.record.data.severity as AuditSeverity),
          )
        ],
      sensitivity:
        event.sensitivity === 'SENSITIVE' ||
        this.record.data.sensitive === true ||
        ['PAYROLL', 'FINANCIAL'].includes(event.category)
          ? 'SENSITIVE'
          : 'STANDARD',
    };
  }
  static select(rows: AuditObject[], event: AuditEventInput): AuditPolicy | null {
    return (
      rows
        .map((row) => new AuditPolicy(row))
        .filter((policy) => policy.applies(event))
        .sort(
          (a, b) =>
            Number(Boolean(b.record.data.eventType)) - Number(Boolean(a.record.data.eventType)) ||
            b.version - a.version ||
            b.record.createdAt.localeCompare(a.record.createdAt) ||
            a.record.id.localeCompare(b.record.id),
        )[0] || null
    );
  }
}
