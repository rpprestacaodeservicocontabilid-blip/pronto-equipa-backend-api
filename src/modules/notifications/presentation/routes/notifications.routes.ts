import { createHash, timingSafeEqual } from 'crypto';

import { notificationCallback } from '../middlewares/provider-callback';
import { Router, Request, RequestHandler } from 'express';
import { z } from 'zod';
import { NotificationsService } from '../../application/use-cases/notifications.service';

const channel = z.enum(['IN_APP', 'EMAIL', 'SMS']);
export const notificationSchema = z.object({
  key: z.string().min(8).max(160),
  category: z.string().regex(/^[A-Z_]{2,40}$/),
  template: z.string().regex(/^[A-Z0-9_]{2,80}$/),
  variables: z.record(z.string(), z.string().max(4000)),
  recipients: z
    .array(z.number().int().positive().max(2147483647))
    .min(1)
    .max(500)
    .transform((v) => [...new Set(v)]),
  channels: z
    .array(channel)
    .min(1)
    .max(3)
    .transform((v) => [...new Set(v)]),
  scheduledAt: z.string().datetime().optional(),
});
export function createNotificationsRoutes(
  service: NotificationsService,
  options: { guard: (permission: string) => RequestHandler },
) {
  const routes = Router(),
    personalRoutes = Router(),
    adminRoutes = Router();
  const handle =
    (
      fn: (
        req: Request<Record<string, string>, unknown, unknown>,
        c: number | null,
        a: number,
      ) => Promise<unknown>,
      personal = false,
    ): RequestHandler =>
    async (req, res, next) => {
      try {
        const actor = Number(req.user?.userId),
          companyId = personal ? null : req.tenant?.companyId;
        if (!actor || (!personal && !companyId)) {
          res.sendStatus(400);
          return;
        }
        if (req.params.id) z.string().uuid().parse(req.params.id);
        res.json({ success: true, data: await fn(req, companyId!, actor) });
      } catch (e) {
        next(e);
      }
    };
  for (const [router, personal] of [
    [routes, false],
    [personalRoutes, true],
  ] as const) {
    router.use('/me', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    router.get(
      '/me',
      handle(
        (r, c, a) =>
          service.inbox(c, a, z.coerce.number().int().min(1).max(100000).default(1).parse(r.query.page),
            z.enum(['UNREAD', 'READ', 'ARCHIVED']).optional().parse(r.query.state)),
        personal,
      ),
    );
    router.get(
      '/me/unread-count',
      handle(async (_r, c, a) => service.unread(c, a), personal),
    );
    router.get(
      '/me/preferences',
      handle((_r, c, a) => service.preferences(c, a), personal),
    );
    router.get('/me/preferences/history', handle((_r, c, a) => service.preferenceHistory(c, a), personal));
    router.get('/me/:id([a-fA-F0-9-]{36})', handle((r, c, a) => service.inboxItem(c, a, r.params.id), personal));
    router.post(
      '/me/read-all',
      handle((_r, c, a) => service.readAll(c, a), personal),
    );
    router.post(
      '/me/:id/read',
      handle((r, c, a) => service.mark(c, a, r.params.id, 'READ'), personal),
    );
    router.post(
      '/me/:id/archive',
      handle((r, c, a) => service.mark(c, a, r.params.id, 'ARCHIVED'), personal),
    );
    router.put(
      '/me/preferences',
      handle(
        (r, c, a) =>
          service.preference(
            c,
            a,
            z
              .object({ category: z.string().min(2).max(40), channel, enabled: z.boolean() })
              .parse(r.body),
          ),
        personal,
      ),
    );
  }
  routes.post(
    '/send',
    options.guard('notifications:send'),
    handle((r, c, a) =>
      service.send(
        c,
        a,
        notificationSchema
          .refine((v) => v.recipients.length === 1, 'Utilize campanhas para envio em massa.')
          .parse(r.body),
      ),
    ),
  );
  routes.post(
    '/campaigns',
    options.guard('notifications:bulk:send'),
    handle((r, c, a) => service.send(c, a, notificationSchema.parse(r.body))),
  );
  routes.post(
    '/campaigns/:id/cancel',
    options.guard('notifications:campaigns:cancel'),
    handle((r, c, a) => service.cancel(c, r.params.id, a)),
  );
  for (const [path, kind] of Object.entries({
    templates: 'TEMPLATE',
    deliveries: 'DELIVERY',
    campaigns: 'MESSAGE',
    audit: 'AUDIT',
    quotas: 'QUOTA',
  }))
    routes.get(
      `/${path}`,
      options.guard(
        path === 'audit'
          ? 'notifications:audit:read'
          : path === 'quotas'
            ? 'notifications:quotas:read'
            : `notifications:${path}:read`,
      ),
      handle((_r, c) => service.list(c, kind)),
    );
  routes.post(
    '/templates',
    options.guard('notifications:templates:create'),
    handle((r, c, a) =>
      service.template(
        c,
        a,
        z
          .object({
            code: z.string().regex(/^[A-Z0-9_]{2,80}$/),
            subject: z.string().max(200),
            body: z.string().min(1).max(16000),
            category: z.string().min(2).max(40),
            mandatory: z.literal(false).default(false),
          })
          .parse(r.body),
      ),
    ),
  );
  routes.post(
    '/templates/:id/publish',
    options.guard('notifications:templates:publish'),
    handle((r, c, a) => service.publish(c, a, r.params.id)),
  );
  adminRoutes.get('/providers', (_r, res) =>
    res.json({
      data: ['EMAIL', 'SMS'].map((c) => ({
        channel: c,
        configured: Boolean(
          process.env[`NOTIFICATIONS_${c}_URL`] && process.env[`NOTIFICATIONS_${c}_TOKEN`],
        ),
      })),
    }),
  );

  routes.post(
    '/deliveries/:id/retry',
    options.guard('notifications:deliveries:retry'),
    handle((r, c, a) => service.retry(c, a, r.params.id)),
  );
  routes.patch(
    '/templates/:id',
    options.guard('notifications:templates:update'),
    handle((r, c) =>
      service.editTemplate(
        c,
        r.params.id,
        z
          .object({ subject: z.string().max(200), body: z.string().min(1).max(16000) })
          .parse(r.body),
      ),
    ),
  );
  routes.post(
    '/templates/:id/preview',
    options.guard('notifications:templates:read'),
    handle((r, c) =>
      service.preview(
        c,
        r.params.id,
        z.object({ variables: z.record(z.string(), z.string().max(4000)) }).parse(r.body).variables,
      ),
    ),
  );
  routes.get('/me/stream', async (req, res, next) => {
    try {
      const c = req.tenant?.companyId,
        a = Number(req.user?.userId);
      if (!c || !a) {
        res.sendStatus(400);
        return;
      }
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.flushHeaders();
      let closed = false;
      const send = async () => {
        if (closed) return;
        try {
          res.write(`event: unread\ndata: ${JSON.stringify(await service.unread(c, a))}\n\n`);
        } catch {
          res.end();
        }
      };
      await send();
      const timer = setInterval(() => void send(), 15000);
      const timeout = setTimeout(() => res.end(), 300000);
      req.on('close', () => {
        closed = true;
        clearInterval(timer);
        clearTimeout(timeout);
      });
    } catch (e) {
      next(e);
    }
  });
  routes.get(
    '/rules',
    options.guard('notifications:rules:read'),
    handle((_r, c) => service.list(c, 'RULE')),
  );
  routes.put(
    '/rules',
    options.guard('notifications:rules:manage'),
    handle((r, c, a) =>
      service.rule(
        c!,
        a,
        z
          .object({
            code: z.string().regex(/^[A-Z0-9_]{2,80}$/),
            eventType: z.string().min(3).max(100),
            template: z.string().min(2).max(80),
            category: z.string().min(2).max(40),
            recipients: z.array(z.number().int().positive()).min(1).max(500),
            channels: z.array(channel).min(1).max(3),
            enabled: z.boolean(),
          })
          .parse(r.body),
      ),
    ),
  );
  routes.get(
    '/reports',
    options.guard('notifications:reports:read'),
    handle((_r, c) => service.report(c)),
  );
  const integrationRoutes = Router();
  integrationRoutes.post('/provider-events', notificationCallback(service));
  integrationRoutes.post('/events', async (req, res, next) => {
    try {
      const token = process.env.NOTIFICATIONS_EVENTS_TOKEN;
      const provided = String(req.headers.authorization || '');
      if (
        !token ||
        !timingSafeEqual(
          createHash('sha256').update(provided).digest(),
          createHash('sha256').update(`Bearer ${token}`).digest(),
        )
      ) {
        res.sendStatus(401);
        return;
      }
      const envelope = z
        .object({
          companyId: z.number().int().positive().nullable(),
          notification: notificationSchema,
        })
        .parse(req.body);
      res.json({ data: await service.send(envelope.companyId, 0, envelope.notification) });
    } catch (e) {
      next(e);
    }
  });
  integrationRoutes.post('/domain-events', async (req, res, next) => {
    try {
      const token = process.env.NOTIFICATIONS_EVENTS_TOKEN;
      if (
        !token ||
        !timingSafeEqual(
          createHash('sha256')
            .update(String(req.headers.authorization || ''))
            .digest(),
          createHash('sha256').update(`Bearer ${token}`).digest(),
        )
      ) {
        res.sendStatus(401);
        return;
      }
      const body = z
        .object({
          companyId: z.number().int().positive(),
          id: z.string().min(1).max(120),
          type: z.string().min(3).max(100),
          variables: z.record(z.string(), z.string().max(4000)),
        })
        .parse(req.body);
      res.json({ data: await service.consume(body.companyId, body) });
    } catch (e) {
      next(e);
    }
  });
  return { routes, personalRoutes, adminRoutes, integrationRoutes, service };
}
