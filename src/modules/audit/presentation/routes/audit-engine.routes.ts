import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { AuditServices } from '../../application/use-cases/audit-services';
import {
  AuditAccess,
  AuditObjectKind,
  auditCategories,
  auditFailure,
  auditScope,
  auditText,
} from '../../domain/audit-contracts';

export type AuditAuthorize = (
  actorId: number,
  companyId: number | null,
  permission: string,
) => Promise<boolean>;
const text = z.string().trim().min(1).max(200);
const reason = z.string().trim().min(3).max(2000);
const identifiers = z.array(z.string().uuid()).min(1).max(1000);
const querySchema = z.object({
  eventType: text.optional(),
  category: z.enum(auditCategories).optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  outcome: z.enum(['SUCCESS', 'FAILURE', 'DENIED', 'PARTIAL', 'CANCELLED']).optional(),
  actorId: text.optional(),
  resourceType: text.optional(),
  resourceId: text.optional(),
  correlationId: text.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  cursor: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});
const id = (req: Request) => z.string().uuid().parse(req.params.id);

/** The router receives authenticated identity and resolved tenant from the composition root. */
export function createAuditEngineRoutes(
  services: AuditServices,
  authorize: AuditAuthorize,
  platform = false,
): Router {
  const router = Router();
  async function access(req: Request, permission: string, allowOwn = false): Promise<AuditAccess> {
    const actorId = Number(req.user?.userId),
      companyId = platform ? null : req.tenant?.companyId;
    if (!Number.isSafeInteger(actorId) || actorId <= 0)
      throw auditFailure('Authentication required.', 401);
    if (companyId === undefined) throw auditFailure('Resolved tenant required.', 403);
    const permitted = await authorize(actorId, companyId, permission);
    const ownOnly =
      !permitted &&
      allowOwn &&
      !platform &&
      (await authorize(actorId, companyId, 'audit:records:read-own'));
    if (!permitted && !ownOnly) throw auditFailure('Audit permission denied.', 403);
    if (
      permission === 'audit:reports:export' &&
      !(await authorize(actorId, companyId, 'audit:exports:create'))
    )
      throw auditFailure('Audit export permission required.', 403);
    const purpose = auditText(
      req.get('X-Audit-Purpose') ||
        req.query.purpose ||
        (req.body as Record<string, unknown> | undefined)?.purpose,
      'audit purpose',
      2000,
    );
    const sensitive = await authorize(actorId, companyId, 'audit:records:read-sensitive');
    return { ...auditScope(companyId), actorId, purpose, sensitive, ownOnly };
  }
  const route = (
    method: 'get' | 'post',
    path: string,
    permission: string,
    handler: (a: AuditAccess, req: Request, res: Response) => Promise<unknown>,
    allowOwn = false,
  ) => {
    router[method](path, async (req, res, next) => {
      try {
        const a = await access(req, permission, allowOwn);
        const data = await handler(a, req, res);
        if (!res.headersSent) res.json({ success: true, data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          next(auditFailure('Invalid audit request.'));
          return;
        }
        next(error);
      }
    });
  };
  const read = platform ? 'audit:records:read-platform' : 'audit:records:read-tenant';
  route(
    'get',
    '/records',
    read,
    (a, req) => services.query.search(a, querySchema.parse(req.query)),
    true,
  );
  route('get', '/records/:id', read, (a, req) => services.query.get(a, id(req)), true);
  route('get', '/resources/:type/:resourceId/history', 'audit:resources:history', (a, req) =>
    services.query.search(a, {
      ...querySchema.parse(req.query),
      resourceType: text.parse(req.params.type),
      resourceId: text.parse(req.params.resourceId),
    }),
  );
  route('get', '/actors/:actorId/activity', 'audit:actors:activity', (a, req) =>
    services.query.search(a, {
      ...querySchema.parse(req.query),
      actorId: text.parse(req.params.actorId),
    }),
  );
  route('get', '/correlations/:correlationId', 'audit:correlations:read', (a, req) =>
    services.query.search(a, {
      ...querySchema.parse(req.query),
      correlationId: text.parse(req.params.correlationId),
    }),
  );
  route('get', '/dashboard', read, (a, req) =>
    services.query.dashboard(a, querySchema.parse(req.query)),
  );
  route('get', '/reports', 'audit:reports:read', (a, req) =>
    services.query.dashboard(a, querySchema.parse(req.query)),
  );
  for (const [name, category] of [
    ['security', 'SECURITY'],
    ['payroll', 'PAYROLL'],
    ['financial', 'FINANCIAL'],
  ] as const) {
    route('get', `/reports/${name}`, 'audit:reports:read', (a, req) =>
      services.query.dashboard(a, { ...querySchema.parse(req.query), category }),
    );
    route('post', `/reports/${name}/exports`, 'audit:reports:export', (a, req) =>
      services.exports.request(a, {
        ...querySchema.parse((req.body as { filter?: unknown } | undefined)?.filter || {}),
        category,
      }),
    );
  }
  route('get', '/admin/metrics', 'audit:administration:read', async (a) => {
    const result = await services.monitor.status(a);
    await services.core.notice(a, a.actorId, 'audit.metrics.read', a.scopeKey, {
      purpose: a.purpose,
    });
    return result;
  });
  const objectList = (path: string, kind: AuditObjectKind, permission: string) =>
    route('get', path, permission, async (a, req) => {
      const limit = z.coerce.number().int().min(1).max(200).default(50).parse(req.query.limit);
      const offset = z.coerce.number().int().min(0).default(0).parse(req.query.offset);
      const rows = (await services.core.list(a, kind)).filter(
        (row) => a.sensitive || row.data.sensitive !== true,
      );
      await services.core.notice(a, a.actorId, 'audit.management.queried', kind, {
        purpose: a.purpose,
        offset,
        limit,
      });
      return { items: rows.slice(offset, offset + limit), total: rows.length };
    });
  const objectGet = (path: string, kind: AuditObjectKind, permission: string) =>
    route('get', path, permission, async (a, req) => {
      const row = await services.core.objectData(a, kind, id(req));
      if (row.data.sensitive === true && !a.sensitive)
        throw auditFailure('Sensitive audit permission required.', 403);
      await services.core.notice(a, a.actorId, 'audit.management.read', row.id, {
        purpose: a.purpose,
        kind,
      });
      return row;
    });
  objectList('/investigations', 'INVESTIGATION', 'audit:investigations:read');
  objectGet('/investigations/:id', 'INVESTIGATION', 'audit:investigations:read');
  route('post', '/investigations', 'audit:investigations:create', (a, req) => {
    const v = z.object({ title: text, reason }).parse(req.body);
    return services.investigations.open(a, v.title, v.reason);
  });
  route('post', '/investigations/:id/evidence', 'audit:investigations:update', (a, req) =>
    services.investigations.addEvidence(
      a,
      id(req),
      z.object({ recordIds: identifiers }).parse(req.body).recordIds,
    ),
  );
  route('post', '/investigations/:id/close', 'audit:investigations:close', (a, req) =>
    services.investigations.close(a, id(req), z.object({ reason }).parse(req.body).reason),
  );
  route('post', '/evidence-packages', 'audit:evidence:create', (a, req) => {
    const v = z
      .object({ recordIds: identifiers, investigationId: z.string().uuid().optional() })
      .parse(req.body);
    return services.evidence.create(a, v.recordIds, v.investigationId);
  });
  objectGet('/evidence-packages/:id', 'EVIDENCE', 'audit:evidence:read');
  route('post', '/evidence-packages/:id/verify', 'audit:evidence:verify', (a, req) =>
    services.evidence.verify(a, id(req)),
  );
  const download = (res: Response, bytes: Buffer, name: string) => {
    res
      .set({
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${name}.json"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(bytes);
  };
  route('get', '/evidence-packages/:id/download', 'audit:evidence:download', async (a, req, res) =>
    download(res, await services.evidence.download(a, id(req)), `audit-evidence-${id(req)}`),
  );
  objectList('/exports', 'EXPORT', 'audit:exports:read');
  objectGet('/exports/:id', 'EXPORT', 'audit:exports:read');
  route('post', '/exports', 'audit:exports:create', (a, req) =>
    services.exports.request(
      a,
      querySchema.parse(z.object({ filter: querySchema.default({}) }).parse(req.body).filter),
    ),
  );
  for (const [suffix, approved] of [
    ['approve', true],
    ['reject', false],
  ] as const)
    route('post', `/exports/:id/${suffix}`, `audit:exports:${suffix}`, (a, req) =>
      services.exports.decide(a, id(req), approved, z.object({ reason }).parse(req.body).reason),
    );
  route('get', '/exports/:id/download', 'audit:exports:download', async (a, req, res) =>
    download(res, await services.exports.download(a, id(req)), `audit-export-${id(req)}`),
  );
  objectList('/admin/policies', 'POLICY', 'audit:policies:read');
  route('post', '/admin/policies', 'audit:policies:manage', (a, req) =>
    services.monitor.policy(
      a,
      z
        .object({
          code: text,
          eventType: text.optional(),
          severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
          sensitive: z.boolean(),
          reason,
        })
        .parse(req.body),
    ),
  );
  objectList('/admin/integrity', 'INTEGRITY_RUN', 'audit:integrity:read');
  route('post', '/admin/integrity/verify', 'audit:integrity:verify', (a) =>
    services.integrity.verify(a, a.actorId),
  );
  route('post', '/admin/integrity/checkpoints', 'audit:integrity:verify', (a) =>
    services.integrity.checkpoint(a),
  );
  objectList('/admin/ingestion-failures', 'INGESTION_FAILURE', 'audit:administration:read');
  route('post', '/admin/ingestion-failures/:id/retry', 'audit:administration:manage', (a, req) =>
    services.monitor.retry(a, id(req), true),
  );
  objectList('/admin/reconciliation', 'RECONCILIATION', 'audit:administration:read');
  route('post', '/admin/reconciliation', 'audit:administration:manage', (a) =>
    services.monitor.drain(a, true),
  );
  objectList('/admin/retention', 'RETENTION', 'audit:retention:read');
  objectList('/admin/retention/executions', 'RETENTION_RUN', 'audit:retention:read');
  route('post', '/admin/retention', 'audit:retention:manage', (a, req) =>
    services.retention.policy(
      a,
      z
        .object({
          category: z.enum(auditCategories),
          days: z.number().int().positive().max(365000),
          legalReference: reason,
          automatic: z.boolean().default(false),
          reason,
        })
        .parse(req.body),
    ),
  );
  route('post', '/admin/retention/:id/execute', 'audit:retention:manage', (a, req) =>
    services.retention.execute(a, id(req)),
  );
  objectList('/admin/legal-holds', 'LEGAL_HOLD', 'audit:legal-holds:read');
  route('post', '/admin/legal-holds', 'audit:legal-holds:create', (a, req) =>
    services.retention.hold(
      a,
      z
        .object({
          reason,
          recordIds: identifiers.optional(),
          resourceType: text.optional(),
          resourceId: text.optional(),
          wholeScope: z.boolean().optional(),
        })
        .parse(req.body),
    ),
  );
  route('post', '/admin/legal-holds/:id/release', 'audit:legal-holds:release', (a, req) =>
    services.retention.release(a, id(req), z.object({ reason }).parse(req.body).reason),
  );
  objectList('/admin/alerts', 'ALERT', 'audit:alerts:read');
  objectList('/admin/alert-rules', 'ALERT_RULE', 'audit:alerts:read');
  route('post', '/admin/alert-rules', 'audit:alerts:manage', (a, req) =>
    services.monitor.alertRule(
      a,
      z
        .object({
          code: text,
          eventType: text.optional(),
          outcome: z.enum(['SUCCESS', 'FAILURE', 'DENIED', 'PARTIAL', 'CANCELLED']).optional(),
          severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
          threshold: z.number().int().min(1).max(1000),
          windowMinutes: z.number().int().min(1).max(1440),
        })
        .parse(req.body),
    ),
  );
  route('post', '/admin/alerts/:id/acknowledge', 'audit:alerts:manage', (a, req) =>
    services.core.repository.transaction(a, async (tx) => {
      const row = await services.core.requireObject(a, 'ALERT', id(req), tx);
      const data = z.object({ reason }).parse(req.body);
      const result = await services.core.repository.updateObject(
        row,
        {
          status: 'ACKNOWLEDGED',
          data: { ...row.data, acknowledgedBy: a.actorId, reason: data.reason },
        },
        tx,
      );
      await services.core.notice(
        a,
        a.actorId,
        'audit.alert.acknowledged',
        row.id,
        { reason: data.reason },
        tx,
      );
      return result;
    }),
  );
  return router;
}
