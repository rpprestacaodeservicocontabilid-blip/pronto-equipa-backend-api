import { supportPriorities } from '../../domain/support-ticket';
import { Request, RequestHandler, Response, Router } from 'express';
import { z } from 'zod';
import { SupportApplicationService } from '../../application/use-cases/support-application.service';
import { SupportController } from '../controllers/support.controller';
import {
  supportArticlePatchSchema,
  supportArticleSchema,
  supportAssignmentSchema,
  supportIncidentPatchSchema,
  supportIncidentSchema,
  supportMessageSchema as messageSchema,
  supportPageSchema as pageSchema,
  supportPolicySchema,
  supportRatingSchema,
  supportResourceSchema,
  supportTicketSchema as ticketSchema,
  supportUpdateTicketSchema,
} from '../schemas/support.schema';
const id = z.string().uuid();
const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) =>
    void fn(req, res).catch(next);

export function createSupportRoutes(
  service: SupportApplicationService,
  requirePermission: (permission: string) => RequestHandler,
) {
  const controller = new SupportController(service);
  const routes = Router();
  const admin = Router();
  const handler = (name: keyof SupportController, ...args: unknown[]): RequestHandler =>
    asyncRoute((req, res) =>
      (controller[name] as (...values: any[]) => Promise<void>)(req, res, ...args),
    );
  const validateBody =
    (schema: z.ZodTypeAny): RequestHandler =>
    (req, _res, next) => {
      try {
        req.body = schema.parse(req.body);
        next();
      } catch (error) {
        next(error);
      }
    };
  const validateId: RequestHandler = (req, _res, next) => {
    try {
      req.params.id = id.parse(req.params.id);
      next();
    } catch (error) {
      next(error);
    }
  };
  const validateList: RequestHandler = (req, _res, next) => {
    try {
      pageSchema.parse(req.query);
      next();
    } catch (error) {
      next(error);
    }
  };

  routes.post(
    '/tickets',
    requirePermission('support:tickets:create'),
    validateBody(ticketSchema),
    handler('createTicket'),
  );
  routes.get(
    '/tickets',
    requirePermission('support:tickets:read-own'),
    validateList,
    handler('listTickets', true),
  );
  routes.get(
    '/tickets/:id',
    requirePermission('support:tickets:read-own'),
    validateId,
    handler('getTicket'),
  );
  routes.post(
    '/tickets/:id/messages',
    requirePermission('support:messages:create'),
    validateId,
    validateBody(messageSchema),
    handler('messages', false),
  );
  routes.get(
    '/tickets/:id/messages',
    requirePermission('support:messages:read'),
    validateId,
    handler('messages', false),
  );
  routes.get(
    '/tickets/:id/history',
    requirePermission('support:tickets:read-own'),
    validateId,
    handler('history', false),
  );
  routes.get(
    '/tickets/:id/sla',
    requirePermission('support:sla:read'),
    validateId,
    handler('sla', false),
  );
  routes.post(
    '/tickets/:id/rating',
    requirePermission('support:surveys:submit'),
    validateId,
    validateBody(supportRatingSchema),
    handler('rate'),
  );
  routes.get(
    '/knowledge/articles',
    requirePermission('support:knowledge:read'),
    handler('searchArticles'),
  );

  admin.get(
    '/tickets',
    requirePermission('support:tickets:read-team'),
    validateList,
    handler('listTickets', false),
  );
  admin.get(
    '/tickets/:id',
    requirePermission('support:tickets:read-team'),
    validateId,
    handler('getTicket', true),
  );
  admin.patch(
    '/tickets/:id',
    requirePermission('support:tickets:update'),
    validateId,
    validateBody(supportUpdateTicketSchema),
    handler('updateTicket'),
  );
  admin.post(
    '/tickets/:id/assign',
    requirePermission('support:tickets:assign'),
    validateId,
    validateBody(supportAssignmentSchema),
    handler('assignTicket'),
  );
  admin.post(
    '/tickets/:id/transfer',
    requirePermission('support:tickets:transfer'),
    validateId,
    validateBody(
      z
        .object({
          teamId: z.string().uuid(),
        })
        .strict(),
    ),
    handler('transferTicket'),
  );
  admin.patch(
    '/tickets/:id/priority',
    requirePermission('support:tickets:update'),
    validateId,
    validateBody(
      z
        .object({
          priority: z.enum(supportPriorities),
        })
        .strict(),
    ),
    handler('changePriority'),
  );
  admin.post(
    '/tickets/:id/resolve',
    requirePermission('support:tickets:resolve'),
    validateId,
    validateBody(z.object({ resolution: z.string().trim().min(3).max(4000) }).strict()),
    handler('transition', 'RESOLVED'),
  );
  admin.post(
    '/tickets/:id/close',
    requirePermission('support:tickets:close'),
    validateId,
    handler('transition', 'CLOSED'),
  );
  admin.post(
    '/tickets/:id/reopen',
    requirePermission('support:tickets:reopen'),
    validateId,
    handler('transition', 'OPEN'),
  );
  admin.post(
    '/tickets/:id/cancel',
    requirePermission('support:tickets:update'),
    validateId,
    handler('transition', 'CANCELLED'),
  );
  admin.post(
    '/tickets/:id/internal-notes',
    requirePermission('support:internal-notes:create'),
    validateId,
    validateBody(
      messageSchema.extend({
        visibility: z.literal('INTERNAL').default('INTERNAL'),
      }),
    ),
    handler('messages', true),
  );
  admin.get(
    '/tickets/:id/messages',
    requirePermission('support:internal-notes:read'),
    validateId,
    handler('messages', true),
  );
  admin.get(
    '/tickets/:id/history',
    requirePermission('support:tickets:read-team'),
    validateId,
    handler('history', true),
  );
  admin.get(
    '/tickets/:id/sla',
    requirePermission('support:sla:read'),
    validateId,
    handler('sla', true),
  );
  admin.post(
    '/tickets/:id/incidents',
    requirePermission('support:incidents:manage'),
    validateId,
    validateBody(
      z
        .object({
          incidentId: z.string().uuid(),
        })
        .strict(),
    ),
    handler('linkIncident'),
  );

  admin.get('/sla/policies', requirePermission('support:sla:read'), handler('listPolicies'));
  admin.post(
    '/sla/policies',
    requirePermission('support:sla:manage'),
    validateBody(supportPolicySchema),
    handler('createPolicy'),
  );
  admin.get('/sla/at-risk', requirePermission('support:sla:read'), handler('monitorSla'));
  admin.get('/sla/breaches', requirePermission('support:sla:read'), handler('monitorSla'));

  const resources: Array<[string, string, string]> = [
    ['queues', 'QUEUE', 'support:queues'],
    ['teams', 'TEAM', 'support:teams'],
    ['agents', 'AGENT', 'support:agents'],
    ['macros', 'MACRO', 'support:macros'],
    ['automations', 'AUTOMATION', 'support:automations'],
    ['categories', 'CATEGORY', 'support:queues'],
  ];
  for (const [path, kind, permission] of resources) {
    admin.get(`/${path}`, requirePermission(`${permission}:read`), handler('listResource', kind));
    admin.post(
      `/${path}`,
      requirePermission(`${permission}:manage`),
      validateBody(supportResourceSchema),
      handler('createResource', kind),
    );
  }
  admin.get(
    '/incidents',
    requirePermission('support:incidents:read'),
    handler('listResource', 'INCIDENT'),
  );
  admin.post(
    '/incidents',
    requirePermission('support:incidents:create'),
    validateBody(supportIncidentSchema),
    handler('createIncident'),
  );
  admin.post(
    '/tickets/:id/escalate',
    requirePermission('support:escalations:create'),
    validateId,
    validateBody(
      z
        .object({
          reason: z.string().trim().min(3).max(2000),
        })
        .strict(),
    ),
    handler('escalateTicket'),
  );
  admin.patch(
    '/incidents/:id',
    requirePermission('support:incidents:manage'),
    validateId,
    validateBody(supportIncidentPatchSchema),
    handler('updateIncident'),
  );
  admin.post(
    '/knowledge/articles',
    requirePermission('support:knowledge:create'),
    validateBody(supportArticleSchema),
    handler('createArticle'),
  );
  admin.patch(
    '/knowledge/articles/:id',
    requirePermission('support:knowledge:update'),
    validateId,
    validateBody(supportArticlePatchSchema),
    handler('updateArticle'),
  );
  admin.post(
    '/knowledge/articles/:id/publish',
    requirePermission('support:knowledge:publish'),
    validateId,
    handler('publishArticle'),
  );
  admin.get(
    '/knowledge/articles',
    requirePermission('support:knowledge:read'),
    handler('searchArticles', true),
  );
  admin.get('/dashboard', requirePermission('support:reports:read'), handler('dashboard'));
  admin.get('/reports', requirePermission('support:reports:read'), handler('dashboard'));
  admin.get('/audit', requirePermission('support:audit:read'), handler('audit'));

  return { routes, admin };
}
