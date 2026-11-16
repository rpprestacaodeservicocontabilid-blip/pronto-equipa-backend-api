import { providerWebhook } from '../middlewares/provider-webhook';

import { Router, Request, RequestHandler } from 'express';
import { z } from 'zod';
import { BillingCommercialService as BillingService } from '../../application/use-cases/billing-commercial.service';
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const line = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1).max(1000000),
  unitPrice: money,
  discount: money.default('0.00'),
  taxBasisPoints: z.number().int().min(0).max(10000),
  taxRuleVersion: z.string().min(1),
});
export function createPlatformBillingRoutes(
  service: BillingService,
  options: { requirePermission: (permission: string) => RequestHandler },
) {
  const routes = Router(),
    adminRoutes = Router();
  const handle =
    (
      operation: (
        req: Request<Record<string, string>, unknown, unknown>,
        companyId: number,
        actor: number,
      ) => Promise<unknown>,
      admin = false,
    ): RequestHandler =>
    async (req, res, next) => {
      try {
        const companyId = admin
          ? z.coerce.number().int().positive().parse(req.params.companyId)
          : req.tenant?.companyId;
        if (!companyId || !req.user?.userId) {
          res.status(400).json({ success: false, message: 'Contexto autenticado obrigatório.' });
          return;
        }
        res.json({ success: true, data: await operation(req, companyId, Number(req.user.userId)) });
      } catch (error) {
        next(error);
      }
    };
  const kinds: Record<string, string> = {
    invoices: 'INVOICE',
    payments: 'PAYMENT',
    receipts: 'RECEIPT',
    account: 'ACCOUNT',
    audit: 'AUDIT',
    events: 'OUTBOX',
    credits: 'CREDIT_NOTE',
    refunds: 'REFUND',
    statements: 'STATEMENT',
    'bank-entries': 'BANK_ENTRY',
    reconciliations: 'RECONCILIATION',
  };
  for (const [path, kind] of Object.entries(kinds)) {
    if (!['audit', 'events'].includes(path))
      routes.get(
        `/${path}`,
        options.requirePermission('platform-billing:read'),
        handle((_r, c) => service.list(c, kind)),
      );
    adminRoutes.get(
      `/tenants/:companyId/${path}`,
      handle((_r, c) => service.list(c, kind), true),
    );
  }
  routes.get(
    '/balance',
    options.requirePermission('platform-billing:read'),
    handle((_r, c) => service.balance(c)),
  );
  const account = z.object({
    name: z.string().min(1),
    taxId: z.string().min(1),
    address: z.string().min(1),
    email: z.string().email(),
  });
  routes.put(
    '/account',
    options.requirePermission('platform-billing:account:update'),
    handle((r, c, a) => service.account(c, a, account.parse(r.body))),
  );
  adminRoutes.put(
    '/tenants/:companyId/account',
    handle((r, c, a) => service.account(c, a, account.parse(r.body)), true),
  );
  adminRoutes.post(
    '/tenants/:companyId/series',
    handle(
      (r, c, a) =>
        service.configureSeries(
          c,
          a,
          z
            .object({
              documentType: z.enum(['FT', 'RC', 'NC', 'ND']).default('FT'),
              prefix: z.string().min(1).max(40),
              issuer: account,
              validationReference: z.string().min(1),
            })
            .parse(r.body),
        ),
      true,
    ),
  );
  adminRoutes.post(
    '/tenants/:companyId/invoices',
    handle(
      (r, c, a) =>
        service.draft(
          c,
          a,
          z
            .object({
              operationKey: z.string().min(1).max(200),
              currency: z.string().regex(/^[A-Z]{3}$/),
              dueAt: z.string().datetime(),
              lines: z.array(line).min(1).max(200),
              subscriptionId: z.string().uuid().optional(),
              periodId: z.string().uuid().optional(),
            })
            .parse(r.body),
        ),
      true,
    ),
  );
  adminRoutes.post(
    '/tenants/:companyId/invoices/:id/issue',
    handle((r, c, a) => service.issue(c, a, z.string().uuid().parse(r.params.id)), true),
  );
  adminRoutes.post(
    '/tenants/:companyId/payments',
    handle(
      (r, c, a) =>
        service.payment(
          c,
          a,
          z
            .object({
              invoiceId: z.string().uuid(),
              amount: money.refine((v) => Number(v) > 0),
              currency: z.string().regex(/^[A-Z]{3}$/),
              provider: z.string().min(1).max(80),
              reference: z.string().min(1).max(120),
            })
            .parse(r.body),
        ),
      true,
    ),
  );
  adminRoutes.post(
    '/tenants/:companyId/payments/:id/confirm',
    handle(
      (r, c, a) =>
        service.confirm(
          c,
          a,
          z.string().uuid().parse(r.params.id),
          z.object({ evidence: z.string().min(1).max(2000) }).parse(r.body).evidence,
        ),
      true,
    ),
  );
  const identifier = z.string().uuid();
  adminRoutes.post(
    '/tenants/:companyId/credit-notes',
    handle(
      (r, c, a) =>
        service.credit(
          c,
          a,
          z
            .object({
              invoiceId: identifier,
              amount: money,
              reason: z.string().min(1),
              operationKey: z.string().min(1),
            })
            .parse(r.body),
        ),
      true,
    ),
  );
  adminRoutes.post(
    '/tenants/:companyId/refunds',
    handle(
      (r, c, a) =>
        service.refund(
          c,
          a,
          z
            .object({
              paymentId: identifier,
              amount: money,
              reason: z.string().min(1),
              operationKey: z.string().min(1),
            })
            .parse(r.body),
        ),
      true,
    ),
  );
  adminRoutes.post(
    '/tenants/:companyId/refunds/:id/decision',
    handle(
      (r, c, a) =>
        service.decideRefund(
          c,
          a,
          identifier.parse(r.params.id),
          z.object({ approve: z.boolean() }).parse(r.body).approve,
        ),
      true,
    ),
  );
  adminRoutes.post(
    '/tenants/:companyId/refunds/:id/execute',
    handle(
      (r, c, a) =>
        service.executeRefund(
          c,
          a,
          identifier.parse(r.params.id),
          z.object({ evidence: z.string().min(1) }).parse(r.body).evidence,
        ),
      true,
    ),
  );
  adminRoutes.post(
    '/tenants/:companyId/statements',
    handle(
      (r, c, a) =>
        service.importStatement(
          c,
          a,
          z
            .object({
              operationKey: z.string().min(1),
              entries: z
                .array(
                  z.object({
                    reference: z.string().min(1).max(200),
                    amount: money,
                    currency: z.string().regex(/^[A-Z]{3}$/),
                    occurredAt: z.string().datetime(),
                  }),
                )
                .min(1)
                .max(1000),
            })
            .parse(r.body),
        ),
      true,
    ),
  );
  adminRoutes.post(
    '/tenants/:companyId/reconciliation',
    handle((r, c, a) => {
      const b = z.object({ entryId: identifier, paymentId: identifier }).parse(r.body);
      return service.reconcile(c, a, b.entryId, b.paymentId);
    }, true),
  );
  adminRoutes.post(
    '/tenants/:companyId/tax-rules',
    handle(
      (r, c, a) =>
        service.fiscalRule(
          c,
          a,
          z
            .object({
              version: z.string().min(1),
              basisPoints: z.number().int().min(0).max(10000),
              validFrom: z.string().datetime(),
              validUntil: z.string().datetime(),
              legalReference: z.string().min(1),
            })
            .parse(r.body),
        ),
      true,
    ),
  );
  adminRoutes.post(
    '/tenants/:companyId/schedules',
    handle(
      (r, c, a) =>
        service.schedule(
          c,
          a,
          z
            .object({
              operationKey: z.string().min(1),
              subscriptionId: identifier,
              currency: z.string().regex(/^[A-Z]{3}$/),
              nextAt: z.string().datetime(),
              intervalMonths: z.number().int().min(1).max(12),
              dueDays: z.number().int().min(0).max(365),
              lines: z.array(line).min(1).max(200),
            })
            .parse(r.body),
        ),
      true,
    ),
  );
  adminRoutes.post(
    '/tenants/:companyId/debit-notes',
    handle(
      (r, c, a) =>
        service.debit(
          c,
          a,
          z
            .object({
              invoiceId: identifier,
              operationKey: z.string().min(1),
              reason: z.string().min(1),
              lines: z.array(line).min(1).max(200),
            })
            .parse(r.body),
        ),
      true,
    ),
  );
  routes.get(
    '/documents/:kind/:id/pdf',
    options.requirePermission('platform-billing:read'),
    async (req, res, next) => {
      try {
        const companyId = req.tenant?.companyId;
        if (!companyId) throw new Error('Contexto obrigatório.');
        const kind = z.enum(['INVOICE', 'RECEIPT', 'CREDIT_NOTE']).parse(req.params.kind);
        const pdf = await service.pdf(companyId, identifier.parse(req.params.id), kind);
        res
          .type('application/pdf')
          .set('Content-Disposition', `attachment; filename="${req.params.id}.pdf"`)
          .send(pdf);
      } catch (e) {
        next(e);
      }
    },
  );
  adminRoutes.post(
    '/tenants/:companyId/schedules/:id/cancel',
    handle((r, c, a) => service.cancelSchedule(c, a, identifier.parse(r.params.id)), true),
  );
  adminRoutes.post(
    '/tenants/:companyId/events/:id/retry',
    handle((r, c, a) => service.retryEvent(c, a, identifier.parse(r.params.id)), true),
  );
  adminRoutes.get(
    '/tenants/:companyId/balance',
    handle((_r, c) => service.balance(c), true),
  );
  adminRoutes.get(
    '/tenants/:companyId/schedules',
    handle((_r, c) => service.list(c, 'SCHEDULE'), true),
  );
  const integrationRoutes = Router();
  integrationRoutes.post('/provider-events', providerWebhook(service));
  return { routes, adminRoutes, integrationRoutes, service };
}
