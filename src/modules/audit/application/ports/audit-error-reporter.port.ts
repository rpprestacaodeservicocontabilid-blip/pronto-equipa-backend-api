export interface AuditErrorReporterPort {
  error(message: string, context: Record<string, unknown>): void;
}
