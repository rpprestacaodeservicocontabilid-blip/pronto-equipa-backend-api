import { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { BillingCommercialService } from '../../application/use-cases/billing-commercial.service';
import { BillingAdminReader, BillingKind, billingKinds } from '../../infrastructure/persistence/billing-admin-reader';

const id = z.string().uuid();
const companyId = z.coerce.number().int().min(1).max(2147483647);
const company = z.object({ companyId: companyId.optional() });
const text = z.string().trim().min(1).max(100);
const flag = z.literal('true').transform(() => true).optional();
const directory = z.enum(billingKinds);
const filters = z.object({
  companyId: companyId.optional(),
  status: z.string().regex(/^[A-Z_]{2,40}$/).optional(),
  reference: text.optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  debit: flag, recurring: flag, overdue: flag, unallocated: flag,
  limit: z.coerce.number().int().min(1).max(100).default(25),
  beforeId: id.optional(),
  beforeDate: z.string().datetime().optional(),
}).refine(query => (!query.from || !query.to || query.from <= query.to) && Boolean(query.beforeId) === Boolean(query.beforeDate));

const directoryGrant: Record<BillingKind, string> = {
  ACCOUNT: 'accounts:read', ACCOUNT_HISTORY: 'accounts:read', INVOICE: 'invoices:read',
  PAYMENT: 'payments:read', PAYMENT_ALLOCATION: 'payments:read', RECEIPT: 'receipts:read',
  CREDIT_NOTE: 'credit-notes:read', REFUND: 'refunds:read', SCHEDULE: 'schedules:read',
  OUTBOX: 'schedules:read', STATEMENT: 'reconciliation:read', BANK_ENTRY: 'reconciliation:read',
  RECONCILIATION: 'reconciliation:read', TAX_RULE: 'tax-rules:read', SERIES: 'document-series:read', AUDIT: 'audit:read',
};
type AdminGuard = (permission: string) => RequestHandler;

export function registerBillingAdminReads(router: Router, service: BillingCommercialService, reader: BillingAdminReader, authorize: AdminGuard) {
  const recordsAccess: RequestHandler = (req, res, next) => {
    const result = directory.safeParse(req.params.kind);
    if (!result.success) return next(result.error);
    const permission = result.data === 'INVOICE' && req.query.overdue === 'true'
      ? 'collections:read' : directoryGrant[result.data];
    return authorize(permission)(req, res, next);
  };
  const handle = (read: (req: Parameters<RequestHandler>[0]) => Promise<unknown>): RequestHandler =>
    async (req, res, next) => {
      try {
        const data = await read(req);
        res.set('Cache-Control', 'no-store');
        if (data === null) res.status(404).json({ message: 'Billing record not found.' });
        else res.json({ success: true, data });
      } catch (error) { next(error); }
    };

  router.get('/overview', authorize('reports:read'), handle(req => reader.overview(company.parse(req.query).companyId)));
  router.get('/reports/export', authorize('reports:read'), authorize('reports:export'),
    handle(req => reader.overview(company.parse(req.query).companyId)));
  router.get('/accounts', authorize('accounts:read'), handle(req => {
    const query = company.extend({ search: text.optional() }).parse(req.query);
    return reader.accounts(query.companyId, query.search).then(data => data.accounts);
  }));
  router.get('/records/:kind', recordsAccess, handle(req => {
    const { limit, beforeId, beforeDate, ...query } = filters.parse(req.query);
    return reader.records(directory.parse(req.params.kind), query, limit,
      beforeId && beforeDate ? { id: beforeId, createdAt: beforeDate } : undefined);
  }));
  router.get('/tenants/:companyId/records/:kind/:id', recordsAccess, handle(req =>
    reader.detail(companyId.parse(req.params.companyId), directory.parse(req.params.kind), id.parse(req.params.id),
      flag.parse(req.query.overdue))));
  router.get('/tenants/:companyId/documents/:kind/:id/pdf', (req, res, next) => {
    const result = z.enum(['INVOICE', 'RECEIPT', 'CREDIT_NOTE']).safeParse(req.params.kind);
    if (!result.success) return next(result.error);
    const grants = { INVOICE: 'invoices:download', RECEIPT: 'receipts:download', CREDIT_NOTE: 'credit-notes:download' };
    return authorize(grants[result.data])(req, res, next);
  }, async (req, res, next) => {
    try {
      const kind = z.enum(['INVOICE', 'RECEIPT', 'CREDIT_NOTE']).parse(req.params.kind);
      const documentId = id.parse(req.params.id);
      const pdf = await service.pdf(companyId.parse(req.params.companyId), documentId, kind);
      res.set('Cache-Control', 'no-store').type('application/pdf')
        .attachment(documentId + '.pdf').type('application/pdf').send(pdf);
    } catch (error) { next(error); }
  });
}
