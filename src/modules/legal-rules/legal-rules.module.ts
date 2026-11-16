import { NextFunction, Request, Response } from 'express';
import { AuthorizationService } from '../authorization/application/services/authorization.service';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { ManageLegalRulesUseCase } from './application/use-cases/manage-legal-rules.use-case';
import { SequelizeLegalRulesRepository } from './infrastructure/persistence/sequelize-legal-rules.repository';
import { LegalRulesController } from './presentation/controllers/legal-rules.controller';
import {
  createLegalRuleIntegrationRoutes,
  createLegalRuleManagementRoutes,
} from './presentation/routes/legal-rules.routes';

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

export function createLegalRulesModule(options: {
  authorization: AuthorizationService;
  audit: AuditRecorderPort;
}) {
  const repository = new SequelizeLegalRulesRepository();
  const controller = new LegalRulesController(
    new ManageLegalRulesUseCase(repository, options.audit),
  );
  const requirePlatformPermission =
    (permission: string): Middleware =>
    async (req, res, next) => {
      try {
        const userId = req.user?.userId;
        if (!userId) {
          res.status(401).json({ success: false, message: 'Authentication required.' });
          return;
        }
        const allowed = await options.authorization.authorize({
          principalId: userId,
          context: { type: 'platform' },
          permission,
        });
        if (!allowed) {
          res.status(403).json({ success: false, message: 'Access denied.', code: 'FORBIDDEN' });
          return;
        }
        next();
      } catch (error) {
        next(error);
      }
    };
  return {
    async isPublished(id: string) {
      const rule = await repository.get(id);
      return rule.status === 'PUBLISHED';
    },
    managementRoutes: createLegalRuleManagementRoutes(controller, requirePlatformPermission),
    integrationRoutes: createLegalRuleIntegrationRoutes(controller),
  };
}
