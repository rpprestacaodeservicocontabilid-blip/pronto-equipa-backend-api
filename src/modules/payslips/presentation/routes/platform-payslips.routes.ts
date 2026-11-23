import { Request, RequestHandler, Router } from 'express';
import { z } from 'zod';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { BadRequestError } from '../../../../shared/errors/app.error';
import {
  batchStatuses, dateModes, listPayslipCompanies, payslipAudit, payslipBatch, payslipBatches,
  payslipOverview, payslipPolicies, payslipTemplates, payslipVolume, Range, receiptStatuses,
  receiptTypes,
} from '../../infrastructure/platform-payslips.reader';

const day = 86400000;
const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const company = z.coerce.number().int().min(1).max(2147483647);
const page = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const rangeQuery = z.object({
  companyId: company.optional(), from: z.string().date().optional(), to: z.string().date().optional(),
});
const breakdown = { granularity: z.enum(dateModes).default('month') };
const volumeQuery = rangeQuery.extend({
  ...breakdown, type: z.enum(receiptTypes).optional(), status: z.enum(receiptStatuses).optional(),
}).strict();

function resolveRange(value: { from?: string; to?: string; companyId?: number }): Range {
  const to = value.to ?? date(Date.now() + 3600000);
  const from = value.from ?? date(Date.parse(to) - 29 * day);
  const span = Date.parse(to) - Date.parse(from);
  if (span < 0 || span >= 366 * day) throw new BadRequestError('Choose a date range of up to 366 days.');
  return { companyId: value.companyId, from, to };
}

export function createPlatformPayslipsRoutes(audit: AuditRecorderPort) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const get = (path: string, action: (req: Request) => Promise<unknown>) => {
    const handler: RequestHandler = async (req, res, next) => {
      try { res.json({ success: true, data: await action(req) }); }
      catch (error) { next(error); }
    };
    router.get(path, handler);
  };

  get('/companies', req => {
    const input = page.extend({ search: z.string().trim().min(1).max(100).optional() }).strict().parse(req.query);
    return listPayslipCompanies(input.search, input);
  });
  get('/overview', req => payslipOverview(resolveRange(rangeQuery.strict().parse(req.query))));
  get('/volume', req => {
    const input = volumeQuery.parse(req.query);
    return payslipVolume({ ...input, ...resolveRange(input) });
  });
  get('/audit', req => {
    const input = rangeQuery.extend(breakdown).strict().parse(req.query);
    return payslipAudit({ ...resolveRange(input), granularity: input.granularity });
  });
  get('/batches', req => {
    const input = rangeQuery.merge(page).extend({
      companyId: company, status: z.enum(batchStatuses).optional(),
      failures: z.enum(['true']).transform(() => true).optional(),
    }).strict().parse(req.query);
    return payslipBatches({ ...input, ...resolveRange(input), companyId: input.companyId });
  });
  get('/companies/:companyId/batches/:id', req => payslipBatch(
    company.parse(req.params.companyId), z.string().uuid().parse(req.params.id),
  ));
  get('/templates', req => {
    const input = page.extend({ companyId: company }).strict().parse(req.query);
    return payslipTemplates(input.companyId, input);
  });
  get('/policies', req => {
    const input = page.extend({ companyId: company }).strict().parse(req.query);
    return payslipPolicies(input.companyId, input);
  });
  router.post('/reports/export', async (req, res, next) => {
    try {
      const input = volumeQuery.parse(req.body);
      const scope = resolveRange(input);
      const rows = await payslipVolume({ ...input, ...scope });
      await audit.record({
        companyId: null, actorUserId: req.user!.userId, action: 'platform.payslips.report.exported',
        entityType: 'payslip_aggregate_report',
        after: { companyId: scope.companyId ?? null, from: scope.from, to: scope.to, rows: rows.length },
      });
      const content = ['Period,Type,Status,Count', ...rows.map(row => [
        row.period, row.type, row.status, row.total,
      ].join(','))].join('\r\n');
      res.attachment('payslips-summary-' + scope.to + '.csv');
      res.type('text/csv; charset=utf-8').send('\uFEFF' + content);
    } catch (error) { next(error); }
  });

  router.use((_req, res) => { res.status(404).json({ success: false, message: 'Platform payslip route not found.' }); });
  return router;
}

