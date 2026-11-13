import { Request, RequestHandler } from 'express';
import { UnauthorizedError, ValidationError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';

export class PayrollController {
  constructor(private readonly audit: AuditRecorderPort) {}
  handle = (operation: (req: Request, companyId: number, userId: number) => Promise<unknown>, action?: string, status = 200): RequestHandler => async (req, res, next) => {
    try {
      if (!req.user?.userId) throw new UnauthorizedError();
      if (!req.tenant?.companyId) throw new ValidationError('Company context required.');
      const data = await operation(req, req.tenant.companyId, req.user.userId);
      if (action) await this.audit.record({ companyId: req.tenant.companyId, actorUserId: req.user.userId, action, entityType: 'payroll', entityId: data && typeof data === 'object' ? (data as { id?: string }).id : undefined });
      res.setHeader('Cache-Control', 'no-store');
      res.status(status).json({ success: true, data });
    } catch (error) { next(error); }
  };
}
