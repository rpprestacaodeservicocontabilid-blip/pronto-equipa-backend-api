import { AsyncLocalStorage } from 'async_hooks';
export interface AuditRequestContext {
  requestId: string;
  actor: () => number | undefined;
  company: () => number | undefined;
  ipAddress: string | null;
  userAgent: string | null;
}
export const auditRequestContext = new AsyncLocalStorage<AuditRequestContext>();
