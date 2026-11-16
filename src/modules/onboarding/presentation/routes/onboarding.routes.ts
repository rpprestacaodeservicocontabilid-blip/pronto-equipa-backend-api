import { parseImportCsv } from '../../domain/import-csv';
import { createContractSchema } from '../../../contracts/presentation/schemas/contract.schema';
import { createAssignmentSchema } from '../../../salary-structure/presentation/schemas/salary-structure.schema';
import { createComponentSchema } from '../../../salary-structure/presentation/schemas/salary-structure.schema';

import { Router, Request, RequestHandler } from 'express';
import { z } from 'zod';

import { OnboardingResourcesService as OnboardingService } from '../../application/use-cases/onboarding-resources.service';
const company = z.object({
  name: z.string().trim().min(2).max(150),
  taxId: z.string().trim().min(5).max(50),
  email: z.string().email(),
  address: z.string().min(1).max(500),
  phone: z.string().max(30).optional(),
});
const plan = z.object({
  planVersionId: z.string().uuid(),
  interval: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']),
  trialDays: z.number().int().min(0).max(30).default(0),
});
export function createOnboardingRoutes(service: OnboardingService) {
  const routes = Router(),
    adminRoutes = Router();
  const handle =
    (
      fn: (
        req: Request<Record<string, string>, unknown, unknown>,
        actor: number,
      ) => Promise<unknown>,
    ): RequestHandler =>
    async (req, res, next) => {
      try {
        const actor = Number(req.user?.userId);
        if (!actor) {
          res.sendStatus(401);
          return;
        }
        if (req.params.id) z.string().uuid().parse(req.params.id);
        res.json({ success: true, data: await fn(req, actor) });
      } catch (error) {
        next(error);
      }
    };
  routes.get(
    '/plans',
    handle(() => service.plans()),
  );
  routes.post(
    '/applications',
    handle((r, a) =>
      service.start(
        a,
        z
          .object({
            operationKey: z.string().min(8).max(160),
            mode: z.literal('SELF_SERVICE').default('SELF_SERVICE'),
            source: z.string().max(100).default('WEB'),
            termsVersion: z.string().min(1).max(80),
            acceptedTerms: z.literal(true),
          })
          .parse(r.body),
      ),
    ),
  );
  routes.get(
    '/applications/:id',
    handle((r, a) => service.get(r.params.id, a)),
  );
  routes.get(
    '/applications/:id/history',
    handle((r, a) => service.history(r.params.id, a)),
  );
  routes.get(
    '/applications/:id/progress',
    handle((r, a) => service.readiness(r.params.id, a)),
  );
  routes.get(
    '/applications/:id/billing-status',
    handle((r, a) => service.billingStatus(r.params.id, a)),
  );
  const steps: Record<string, z.ZodType<unknown>> = {
    company,
    plan,
    organization: z.object({
      departments: z.array(z.string().min(1).max(100)).max(100),
      costCenters: z.array(z.string().min(1).max(100)).max(100),
    }),
    'payroll-settings': z.object({
      currency: z.literal('AOA'),
      payDay: z.number().int().min(1).max(31),
      legalRuleSetId: z.string().uuid(),
      effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      components: z.array(createComponentSchema).max(50).default([]),
      workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    }),
  };
  for (const [step, schema] of Object.entries(steps))
    routes.put(
      `/applications/:id/${step}`,
      handle((r, a) => {
        const input = z
          .object({ version: z.number().int().positive(), data: schema })
          .parse(r.body);
        return step === 'plan'
          ? service.selectPlan(r.params.id, a, input.data, input.version)
          : service.save(r.params.id, a, step, input.data, input.version);
      }),
    );
  routes.post(
    '/applications/:id/validate-readiness',
    handle((r, a) => service.readiness(r.params.id, a)),
  );
  routes.post(
    '/applications/:id/submit',
    handle((r, a) => service.submit(r.params.id, a)),
  );
  routes.post(
    '/applications/:id/cancel',
    handle((r, a) => service.cancel(r.params.id, a)),
  );
  routes.post(
    '/applications/:id/activate',
    handle((r, a) => service.provision(r.params.id, a)),
  );
  adminRoutes.get(
    '/applications',
    handle(() => service.list()),
  );
  adminRoutes.get(
    '/applications/:id',
    handle((r, a) => service.get(r.params.id, a, true)),
  );
  adminRoutes.get(
    '/applications/:id/history',
    handle((r, a) => service.history(r.params.id, a, true)),
  );
  for (const [path, status] of Object.entries({
    approve: 'APPROVED',
    reject: 'REJECTED',
    'request-info': 'ADDITIONAL_INFO',
  }))
    adminRoutes.post(
      `/applications/:id/${path}`,
      handle((r, a) =>
        service.decision(
          r.params.id,
          a,
          status,
          z.object({ reason: z.string().min(1).max(2000) }).parse(r.body).reason,
        ),
      ),
    );
  routes.post(
    '/applications/:id/consent',
    handle((r, a) =>
      service.consent(
        r.params.id,
        a,
        z
          .object({ termsVersion: z.string().min(1).max(80), accepted: z.literal(true) })
          .parse(r.body).termsVersion,
      ),
    ),
  );
  routes.get(
    '/applications/:id/documents/:documentId/download',
    handle((r, a) =>
      service.downloadDocument(r.params.id, a, z.string().uuid().parse(r.params.documentId)),
    ),
  );
  routes.post(
    '/invitations/accept',
    handle((r, a) =>
      service.accept(
        a,
        z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(r.body).token,
      ),
    ),
  );
  adminRoutes.post(
    '/applications',
    handle((r, a) =>
      service.assisted(
        a,
        z
          .object({
            operationKey: z.string().min(8).max(160),
            mode: z.enum([
              'ADMIN_ASSISTED',
              'SALES_ASSISTED',
              'MIGRATION',
              'ENTERPRISE',
              'INVITATION',
            ]),
            source: z.string().max(100),
            termsVersion: z.string().min(1),
            acceptedTerms: z.literal(true),
          })
          .parse(r.body),
      ),
    ),
  );
  adminRoutes.post(
    '/applications/:id/invitations',
    handle((r, a) =>
      service.invitation(
        r.params.id,
        a,
        z.object({ email: z.string().email() }).parse(r.body).email,
      ),
    ),
  );
  routes.post(
    '/applications/:id/documents',
    handle((r, a) =>
      service.upload(
        r.params.id,
        a,
        z
          .object({
            fileName: z.string().min(1).max(200),
            sizeBytes: z.number().int().positive().max(5242880),
            mimeType: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
          })
          .parse(r.body),
      ),
    ),
  );
  routes.post(
    '/applications/:id/documents/:documentId/submit',
    handle((r, a) =>
      service.completeDocument(r.params.id, a, z.string().uuid().parse(r.params.documentId)),
    ),
  );
  routes.get(
    '/applications/:id/documents',
    handle((r, a) => service.listResources(r.params.id, a, 'DOCUMENT')),
  );
  routes.post(
    '/applications/:id/imports',
    handle((r, a) =>
      service.importBatch(
        r.params.id,
        a,
        z
          .object({
            operationKey: z.string().min(8).max(160),
            rows: z
              .array(
                z.object({
                  employeeNumber: z.string().min(1).max(40),
                  firstName: z.string().min(1).max(100),
                  lastName: z.string().min(1).max(100),
                  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                  email: z.string().email().optional(),
                  phone: z.string().max(30).optional(),
                }),
              )
              .min(1)
              .max(500),
          })
          .parse(r.body),
      ),
    ),
  );
  routes.get(
    '/applications/:id/imports',
    handle((r, a) => service.listResources(r.params.id, a, 'IMPORT')),
  );
  routes.post(
    '/applications/:id/imports/contracts',
    handle((r, a) =>
      service.importBatch(r.params.id, a, {
        ...z
          .object({
            operationKey: z.string().min(8).max(160),
            rows: z.array(createContractSchema).min(1).max(500),
          })
          .parse(r.body),
        kind: 'CONTRACTS',
      }),
    ),
  );
  routes.post(
    '/applications/:id/imports/salaries',
    handle((r, a) =>
      service.importBatch(r.params.id, a, {
        ...z
          .object({
            operationKey: z.string().min(8).max(160),
            rows: z.array(createAssignmentSchema).min(1).max(500),
          })
          .parse(r.body),
        kind: 'SALARIES',
      }),
    ),
  );
  adminRoutes.post(
    '/applications/:id/documents/:documentId/decision',
    handle((r, a) => {
      const body = z
        .object({ approved: z.boolean(), reason: z.string().min(1).max(2000) })
        .parse(r.body);
      return service.validateDocument(
        r.params.id,
        a,
        z.string().uuid().parse(r.params.documentId),
        body.approved,
        body.reason,
      );
    }),
  );
  routes.post(
    '/applications/:id/imports/preview',
    handle(async (r, a) => {
      await service.get(r.params.id, a);
      const input = z
        .object({
          kind: z.enum(['EMPLOYEES', 'CONTRACTS', 'SALARIES']),
          csv: z.string().max(1048576),
        })
        .parse(r.body);
      const rows = parseImportCsv(input.csv);
      const schema =
        input.kind === 'CONTRACTS'
          ? createContractSchema
          : input.kind === 'SALARIES'
            ? createAssignmentSchema
            : z.object({
                employeeNumber: z.string().min(1).max(40),
                firstName: z.string().min(1).max(100),
                lastName: z.string().min(1).max(100),
                admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                email: z.string().email().optional(),
              });
      return {
        kind: input.kind,
        total: rows.length,
        results: rows.map((row, index) => {
          const result = schema.safeParse(row);
          return result.success
            ? { index, valid: true, data: result.data }
            : {
                index,
                valid: false,
                errors: result.error.issues.map((e) => ({
                  field: e.path.join('.'),
                  message: e.message,
                })),
              };
        }),
      };
    }),
  );
  return { routes, adminRoutes, service };
}
