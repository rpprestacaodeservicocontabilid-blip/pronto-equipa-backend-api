import { randomUUID } from 'crypto';
import { RequestHandler } from 'express';
import { AuditCore } from '../../application/use-cases/audit-core';
export interface AuditContextRunner {
  run(
    context: {
      requestId: string;
      actor: () => number | undefined;
      company: () => number | undefined;
      ipAddress: string | null;
      userAgent: string | null;
    },
    operation: () => void,
  ): void;
}
export function auditRequestMiddleware(
  core: AuditCore,
  context: AuditContextRunner,
  onFailure: () => void,
): RequestHandler {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test' && process.env.AUDIT_HTTP_CAPTURE_ENABLED !== 'true') {
      next();
      return;
    }
    // A server-generated correlation id cannot be spoofed through arbitrary request headers.
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    context.run(
      {
        requestId,
        actor: () => req.user?.userId,
        company: () => req.tenant?.companyId,
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent')?.slice(0, 500) || null,
      },
      () => {
        res.once('finish', () => {
          const denied = res.statusCode === 401 || res.statusCode === 403,
            failed = res.statusCode >= 500;
          const security = /^\/(auth|oauth|sessions)(\/|$)/.test(req.path);
          const sensitiveRead =
            req.method === 'GET' &&
            /^\/(payslips|documents|reports|payments|payroll)(\/|$)/.test(req.path);
          if (!denied && !failed && !security && !sensitiveRead) return;
          const companyId = req.tenant?.companyId ?? null;
          void core
            .append({
              eventId: randomUUID(),
              eventType: denied
                ? 'security.request.denied'
                : failed
                  ? 'request.failed'
                  : sensitiveRead
                    ? 'sensitive-resource.accessed'
                    : 'authentication.request',
              sourceId: 'http',
              module: security
                ? 'identity'
                : sensitiveRead
                  ? req.path.split('/')[1] || 'security'
                  : 'security',
              category: denied || security ? 'SECURITY' : 'ACCESS',
              severity: denied || failed ? 'HIGH' : 'MEDIUM',
              scope: companyId === null ? 'PLATFORM' : 'TENANT',
              tenantId: companyId === null ? undefined : String(companyId),
              actor: req.user?.userId
                ? { actorType: 'USER', actorId: String(req.user.userId) }
                : { actorType: 'EXTERNAL', actorId: 'anonymous' },
              action: req.method,
              resource: {
                resourceType: 'HTTP',
                resourceId: String(
                  (req.route as { path?: unknown } | undefined)?.path || 'unmatched',
                ).slice(0, 200),
              },
              outcome: denied ? 'DENIED' : res.statusCode >= 400 ? 'FAILURE' : 'SUCCESS',
              occurredAt: new Date().toISOString(),
              correlationId: requestId,
              requestId,
              metadata: { status: res.statusCode, method: req.method, ipAddress: req.ip },
            })
            .catch(onFailure);
        });
        next();
      },
    );
  };
}
