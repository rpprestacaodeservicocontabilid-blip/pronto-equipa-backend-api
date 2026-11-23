import {
  AuditObject,
  AuditOutcome,
  AuditQuery,
  AuditRecordView,
  AuditSeverity,
  auditFailure,
  auditText,
} from '../audit-contracts';
export interface AuditAlertConfiguration {
  code: string;
  eventType?: string;
  outcome?: AuditOutcome;
  severity?: AuditSeverity;
  threshold: number;
  windowMinutes: number;
}
export class AuditAlertRule {
  readonly configuration: AuditAlertConfiguration;
  constructor(readonly record: AuditObject) {
    if (record.kind !== 'ALERT_RULE') throw auditFailure('Invalid alert rule.');
    this.configuration = AuditAlertRule.normalize(record.data);
  }
  static normalize(data: Record<string, unknown>): AuditAlertConfiguration {
    const threshold = Number(data.threshold),
      windowMinutes = Number(data.windowMinutes);
    if (
      !Number.isSafeInteger(threshold) ||
      threshold < 1 ||
      threshold > 1000 ||
      !Number.isSafeInteger(windowMinutes) ||
      windowMinutes < 1 ||
      windowMinutes > 1440
    )
      throw auditFailure('Invalid alert threshold or window.');
    if (
      data.severity !== undefined &&
      !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(data.severity))
    )
      throw auditFailure('Invalid alert severity.');
    if (
      data.outcome !== undefined &&
      !['SUCCESS', 'FAILURE', 'DENIED', 'PARTIAL', 'CANCELLED'].includes(String(data.outcome))
    )
      throw auditFailure('Invalid alert outcome.');
    return {
      code: auditText(data.code, 'rule code'),
      threshold,
      windowMinutes,
      eventType: data.eventType === undefined ? undefined : auditText(data.eventType, 'event type'),
      outcome: data.outcome as AuditOutcome | undefined,
      severity: data.severity as AuditSeverity | undefined,
    };
  }
  matches(event: Pick<AuditRecordView, 'eventType' | 'outcome' | 'severity'>): boolean {
    const c = this.configuration;
    return (
      this.record.status === 'ACTIVE' &&
      (!c.eventType || c.eventType === event.eventType) &&
      (!c.outcome || c.outcome === event.outcome) &&
      (!c.severity || c.severity === event.severity)
    );
  }
  query(now: Date): AuditQuery {
    const c = this.configuration;
    return {
      from: new Date(now.getTime() - c.windowMinutes * 60000).toISOString(),
      limit: 1000,
      eventType: c.eventType,
      outcome: c.outcome,
      severity: c.severity,
    };
  }
}
