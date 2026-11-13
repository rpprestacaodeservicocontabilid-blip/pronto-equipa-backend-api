export interface AuditEventInput {
  userId: number | null;

  action: string;

  resource: string | null;

  resourceId: string | null;

  ipAddress: string | null;

  userAgent: string | null;

  metadata?: Record<
    string,
    unknown
  >;
}

export interface AuditServicePort {
  record(
    event: AuditEventInput,
  ): Promise<void>;
}