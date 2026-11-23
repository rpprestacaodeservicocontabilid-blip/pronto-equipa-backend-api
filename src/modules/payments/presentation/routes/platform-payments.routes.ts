import { Request, RequestHandler, Router } from 'express';
import { z } from 'zod';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { PaymentsApplicationService } from '../../application/use-cases/payments-application.service';
import {
  listPlatformPayments,
  paymentDirectories,
  PaymentDirectory,
  paymentVolume,
  platformPaymentDetail,
  platformPaymentOverview,
} from '../../infrastructure/platform-payments.reader';

const read = 'payments.platform.read';
const integrations = 'payments.platform.integrations.read';
const reports = 'payments.platform.reports.read';
const auditRead = 'payments.platform.audit.read';
const policies = 'payments.platform.policies.read';
const permissions: Record<PaymentDirectory, string> = {
  instructions: read, orders: read, batches: read, transactions: read, returns: read, reconciliations: read,
  integrations, files: integrations, audit: auditRead, policies,
};

const companyId = z.coerce.number().int().min(1).max(2147483647).optional();
const filterFields = { companyId, from: z.string().date().optional(), to: z.string().date().optional() };
const pageFields = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
};
const providerId = z.string().trim().min(1).max(100).optional();
const status = z.string().regex(/^[A-Z_]{2,32}$/).optional();
const validRange = ({ from, to }: { from?: string; to?: string }) => !from || !to || from <= to;
const overviewQuery = z.object(filterFields).strict().refine(validRange);
const reportQuery = z.object({
  ...filterFields, ...pageFields, providerId, status,
  breakdown: z.enum(['status', 'company', 'provider']).default('status'),
}).strict().refine(validRange);
const listQuery = (view: PaymentDirectory) => z.object({
  ...filterFields, ...pageFields, providerId, status, incident: z.enum(['pending', 'failed']).optional(),
}).strict().refine(filters => validRange(filters)
  && (!filters.providerId || view === 'orders' || view === 'integrations')
  && (!filters.status || !['audit', 'returns', 'policies'].includes(view))
  && (!filters.incident || view === 'orders'));

type PlatformAuthorize = (userId: number, permission: string) => Promise<boolean>;

export function createPlatformPaymentsRoutes(
  payments: PaymentsApplicationService,
  authorize: PlatformAuthorize,
  audit: AuditRecorderPort,
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const get = (
    path: string,
    permission: string,
    readData: (request: Request) => unknown | Promise<unknown>,
  ) => {
    const handler: RequestHandler = async (req, res, next) => {
      try {
        const userId = req.user?.userId;
        if (!userId) {
          res.status(401).json({ message: 'Authentication required.' });
          return;
        }
        if (!(await authorize(userId, permission))) {
          res.status(403).json({ message: 'Payment supervision permission required.' });
          return;
        }
        const purpose = permission === auditRead
          ? z.string().trim().min(5).max(500).parse(req.get('X-Audit-Purpose'))
          : undefined;
        const data = await readData(req);
        if (purpose) {
          await audit.record({
            companyId: null, actorUserId: userId, action: 'platform.payments.audit.viewed',
            entityType: 'payment_audit', entityId: req.params.id,
            after: { purpose, companyId: req.query.companyId ?? null },
          });
        }
        if (data === null) {
          res.status(404).json({ message: 'Payment record not found.' });
          return;
        }
        res.json({ success: true, data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ message: 'Invalid payment filters, reference or audit purpose.' });
          return;
        }
        next(error);
      }
    };
    router.get(path, handler);
  };

  get('/overview', read, req => platformPaymentOverview(overviewQuery.parse(req.query)));
  get('/providers', integrations, () => payments.listProviders());
  get('/reports', reports, req => {
    const { breakdown, ...filters } = reportQuery.parse(req.query);
    return paymentVolume(filters, breakdown);
  });
  for (const view of paymentDirectories) {
    const schema = listQuery(view);
    const id = view === 'audit' ? z.string().regex(/^[1-9]\d{0,9}$/) : z.string().uuid();
    get('/' + view, permissions[view], req => listPlatformPayments(view, schema.parse(req.query)));
    get('/' + view + '/:id', permissions[view], req => platformPaymentDetail(view, id.parse(req.params.id)));
  }
  return router;
}
