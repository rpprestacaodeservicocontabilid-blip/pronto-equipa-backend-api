import { NextFunction, Request, Response, Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { AppError } from '../../../shared/errors/app.error';
import { LegalRulesController } from './legal-rules.controller';
import {
  createLegalRuleSetSchema, legalRuleIdSchema, listLegalRuleSetsSchema,
  resolveLegalRuleSetSchema, updateLegalRuleSetSchema,
} from './legal-rules.schema';

type Middleware = (req: Request, res: Response, next: NextFunction) => void;
type Schema = { parse(value: unknown): unknown };
const validate = (target: 'body' | 'query', schema: Schema): Middleware => (req, _res, next) => {
  try {
    if (target === 'body') req.body = schema.parse(req.body);
    else req.query = schema.parse(req.query) as Request['query'];
    next();
  } catch (error) { next(error); }
};
const validateId: Middleware = (req, _res, next) => {
  try { req.params.id = legalRuleIdSchema.parse(req.params.id); next(); }
  catch (error) { next(error); }
};

export function createLegalRuleManagementRoutes(controller: LegalRulesController, requirePlatformPermission: (permission: string) => Middleware): Router {
  const router = Router();
  router.get('/', requirePlatformPermission('legal-rules:read'), validate('query', listLegalRuleSetsSchema), (req, res) => controller.list(req, res));
  router.get('/:id', requirePlatformPermission('legal-rules:read'), validateId, (req, res) => controller.get(req, res));
  router.post('/', requirePlatformPermission('legal-rules:create'), validate('body', createLegalRuleSetSchema), (req, res) => controller.create(req, res));
  router.patch('/:id', requirePlatformPermission('legal-rules:update'), validateId, validate('body', updateLegalRuleSetSchema), (req, res) => controller.update(req, res));
  router.post('/:id/submit', requirePlatformPermission('legal-rules:submit'), validateId, (req, res) => controller.submit(req, res));
  router.post('/:id/approve', requirePlatformPermission('legal-rules:approve'), validateId, (req, res) => controller.approve(req, res));
  router.post('/:id/publish', requirePlatformPermission('legal-rules:publish'), validateId, (req, res) => controller.publish(req, res));
  router.post('/:id/retire', requirePlatformPermission('legal-rules:retire'), validateId, (req, res) => controller.retire(req, res));
  return router;
}

export function createLegalRuleIntegrationRoutes(controller: LegalRulesController): Router {
  const router = Router();
  const requireIntegrationToken: Middleware = (req, _res, next) => {
    const expected = process.env.PAYROLL_INTEGRATION_TOKEN;
    if (!expected) return next(new AppError('Payroll integration token is not configured.', 503, 'LEGAL_RULES_INTEGRATION_UNAVAILABLE'));
    const authorization = req.header('authorization') ?? '';
    const supplied = /^Bearer\s+(.+)$/i.exec(authorization)?.[1] ?? '';
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    if (!supplied || suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer))
      return next(new AppError('Integration credentials are invalid.', 401, 'UNAUTHORIZED'));
    next();
  };
  router.post('/resolve', requireIntegrationToken, validate('body', resolveLegalRuleSetSchema), (req, res) => controller.resolve(req, res));
  return router;
}
