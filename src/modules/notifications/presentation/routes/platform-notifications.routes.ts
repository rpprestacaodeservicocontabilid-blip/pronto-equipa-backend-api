import { Request, RequestHandler, Router } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { ForbiddenError, ValidationError } from '../../../../shared/errors/app.error';
import type { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import type { NotificationKind } from '../../application/dto/notification-data';
import type { NotificationRecord } from '../../application/ports/notification-store.port';
import type { NotificationsService } from '../../application/use-cases/notifications.service';
import { notificationSchema } from './notifications.routes';

const projections: Record<NotificationKind, readonly string[]> = {
  TEMPLATE: ['code', 'category', 'version', 'subject', 'body', 'mandatory', 'publishedBy'],
  MESSAGE: ['category', 'templateCode', 'templateVersion', 'scheduledAt', 'channels', 'recipientCount', 'origin'],
  DELIVERY: ['messageId', 'channel', 'scheduledAt', 'attempts', 'nextAttemptAt'],
  RULE: ['code', 'eventType', 'category', 'template', 'recipients', 'channels', 'enabled'],
  QUOTA: ['used'],
  PREFERENCE: ['category', 'channel', 'enabled'],
  AUDIT: ['action', 'actor', 'id', 'category', 'channel', 'enabled'],
  ATTEMPT: ['deliveryId', 'attempts'],
};

function view(record: NotificationRecord) {
  return {
    id: record.id, kind: record.kind, status: record.status, createdAt: record.createdAt, updatedAt: record.updatedAt,
    period: record.kind === 'QUOTA' ? record.key : undefined,
    data: Object.fromEntries(projections[record.kind].map(key => [key, record.data[key]])),
  };
}

export interface PlatformNotificationAccess {
  authorize(actor: number, permission: string): Promise<boolean>;
  audit: AuditRecorderPort;
}

const id = (req: Request) => z.string().uuid().parse(req.params.id);
const code = z.string().regex(/^[A-Z0-9_]{2,80}$/);
const category = z.string().regex(/^[A-Z_]{2,40}$/);
const content = { subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(16000) };
const pages = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
};
const listing = z.object({
  ...pages, status: z.string().regex(/^[A-Z_]{2,40}$/).optional(),
  channel: z.enum(['IN_APP', 'EMAIL', 'SMS']).optional(),
}).strict();
const channels = () => [
  { channel: 'IN_APP', configured: true, recipientsAvailable: true },
  { channel: 'EMAIL', configured: Boolean(process.env.NOTIFICATIONS_EMAIL_URL && process.env.NOTIFICATIONS_EMAIL_TOKEN), recipientsAvailable: true },
  { channel: 'SMS', configured: Boolean(process.env.NOTIFICATIONS_SMS_URL && process.env.NOTIFICATIONS_SMS_TOKEN), recipientsAvailable: false },
];
const globalConfig = () => ({
  retentionDays: Number(process.env.NOTIFICATIONS_RETENTION_DAYS || 90),
  cleanupEnabled: process.env.NOTIFICATIONS_CLEANUP_ENABLED === 'true',
  dailyQuota: Number(process.env.NOTIFICATIONS_DAILY_QUOTA || 10000),
});
const manualCategories = ['SYSTEM', 'ANNOUNCEMENT', 'REMINDER'] as const;
function validateManual(input: { category: string; channels: readonly string[] }) {
  if (!manualCategories.some(category => category === input.category))
    throw new ValidationError('Administrative campaigns support system notices, announcements and reminders.');
  if (input.channels.some(name => !channels().some(item => item.channel === name && item.configured && item.recipientsAvailable)))
    throw new ValidationError('One or more delivery channels are unavailable.');
}

export function createPlatformNotificationsRoutes(service: NotificationsService, access: PlatformNotificationAccess) {
  const router = Router();
  const scopes = new WeakMap<Request, number>();
  const actor = (req: Request) => req.user?.userId;
  const enforce = (permission: string, log = true): RequestHandler => async (req, _res, next) => {
    try {
      const user = actor(req);
      if (!user || !await access.authorize(user, 'platform:notifications:' + permission)) throw new ForbiddenError('Notifications access denied.');
      const scope = scopes.get(req) ?? null;
      if (log) await access.audit.record({
        companyId: scope, actorUserId: user, action: 'notifications.platform.access',
        entityType: 'notification_scope', entityId: scope ?? 'platform',
        after: { permission, method: req.method, path: req.path },
      });
      next();
    } catch (e) { next(e); }
  };
  const handle = (action: (req: Request, company: number | null, user: number) => unknown | Promise<unknown>): RequestHandler =>
    async (req, res, next) => {
      try { res.json({ success: true, data: await action(req, scopes.get(req) ?? null, actor(req)!) }); }
      catch (e) { next(e); }
    };

  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, enforce('access', false));
  router.get('/companies', handle(async req => {
    const { search, page, limit } = z.object({ ...pages, search: z.string().trim().max(100).default('') }).strict().parse(req.query);
    const term = search.replace(/[\\%_]/g, '');
    const criteria = !term ? {} : /^\d{1,9}$/.test(term) ? { id: Number(term) } : { name: { [Op.like]: '%' + term + '%' } };
    const result = await CompanyModel.findAndCountAll({
      where: { ...criteria, status: 'ACTIVE' }, attributes: ['id', 'name'],
      order: [['name', 'ASC'], ['id', 'ASC']], offset: (page - 1) * limit, limit,
    });
    return { items: result.rows, page, limit, total: result.count };
  }));

  const scoped = Router();
  for (const [path, kind, grant] of [
    ['messages', 'MESSAGE', 'campaigns:read'], ['campaigns', 'MESSAGE', 'campaigns:read'],
    ['templates', 'TEMPLATE', 'templates:read'], ['deliveries', 'DELIVERY', 'deliveries:read'],
    ['rules', 'RULE', 'rules:read'], ['quotas', 'QUOTA', 'quotas:read'], ['audit', 'AUDIT', 'audit:read'],
  ] as const) {
    scoped.get('/' + path, enforce(grant), handle(async (req, company) => {
      const filter = listing.parse(req.query);
      const result = await service.adminList(company, kind, {
        ...filter,
        ...(path === 'campaigns' ? { origin: 'CAMPAIGN' } : {}),
      });
      return { ...result, items: result.items.map(view) };
    }));
  }
  scoped.get('/deliveries/:id/attempts', enforce('deliveries:read'), handle(async (req, c) =>
    (await service.attempts(c, id(req))).map(view)));
  scoped.post('/deliveries/:id/retry', enforce('deliveries:retry'), handle(async (req, c, a) =>
    view(await service.retry(c, a, id(req)))));
  scoped.post('/campaigns', enforce('bulk:send'), handle(async (req, c, a) => {
    const input = notificationSchema.strict().parse(req.body);
    validateManual(input);
    return view(await service.send(c, a, input, 'CAMPAIGN'));
  }));
  scoped.post('/campaigns/:id/cancel', enforce('campaigns:cancel'), handle(async (req, c, a) =>
    view(await service.cancel(c, id(req), a))));
  scoped.get('/templates/:id/versions', enforce('templates:read'), handle(async (req, c) =>
    (await service.templateVersions(c, id(req))).map(view)));
  scoped.post('/templates', enforce('templates:create'), handle(async (req, c, a) =>
    view(await service.template(c, a, { ...z.object({ code, category, ...content }).strict().parse(req.body), mandatory: false }, true))));
  scoped.patch('/templates/:id', enforce('templates:update'), handle(async (req, c, a) =>
    view(await service.editTemplate(c, id(req), z.object(content).strict().parse(req.body), a))));
  scoped.post('/templates/:id/publish', enforce('templates:publish'), handle(async (req, c, a) =>
    view(await service.publish(c, a, id(req), true))));
  scoped.post('/templates/:id/preview', enforce('templates:read'), handle((req, c) =>
    service.preview(c, id(req), z.object({ variables: z.record(z.string().max(100), z.string().max(4000)) }).strict().parse(req.body).variables)));
  scoped.put('/rules', enforce('rules:manage'), handle(async (req, c, a) => {
    if (c === null) throw new ValidationError('Select a company for an automatic rule.');
    const input = z.object({
      code, category, template: code, eventType: z.string().trim().min(3).max(100),
      recipients: z.array(z.number().int().positive().max(2147483647)).min(1).max(500),
      channels: z.array(z.enum(['IN_APP', 'EMAIL', 'SMS'])).min(1).max(3), enabled: z.boolean(),
    }).strict().parse(req.body);
    validateManual(input);
    return view(await service.rule(c, a, input, true));
  }));
  scoped.get('/dashboard', enforce('reports:read'), handle((_req, c) => service.adminReport(c)));
  scoped.get('/reports', enforce('reports:read'), handle((_req, c) => service.adminReport(c)));
  scoped.get('/reports/export', enforce('reports:export'), handle((_req, c) => service.adminReport(c)));
  scoped.get('/preferences-policy', enforce('templates:read'), handle((_req, c) => service.categoryPolicy(c)));
  scoped.get('/settings', enforce('providers:read'), handle(() => globalConfig()));
  scoped.get('/providers', enforce('providers:read'), handle(() => channels()));

  router.use('/companies/:companyId', (async (req, _res, next) => {
    try {
      const company = z.coerce.number().int().min(1).max(2147483647).safeParse(req.params.companyId);
      if (!company.success || !await CompanyModel.findOne({ where: { id: company.data, status: 'ACTIVE' }, attributes: ['id'] }))
        throw new ForbiddenError('Notification scope unavailable.');
      scopes.set(req, company.data);
      next();
    } catch (e) { next(e); }
  }) as RequestHandler, scoped);
  router.use(scoped);
  return router;
}
