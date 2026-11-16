import { Request, Response } from 'express';

import { QueryAuditLogsUseCase } from '../../application/use-cases/query-audit-logs.use-case';
import { QueryAuditLogsDto } from '../schemas/audit-log.schema';

/**
 * Controller do trilho de auditoria.
 *
 * O `companyId` é sempre obtido do contexto de tenant resolvido pelo
 * middleware — nunca do body nem da query string do cliente.
 */
export class AuditLogController {
  constructor(private readonly queryAuditLogsUseCase: QueryAuditLogsUseCase) {}

  async list(req: Request, res: Response): Promise<void> {
    const companyId = req.tenant?.companyId;

    if (!companyId) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Company context is required.',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
      });

      return;
    }

    const query = req.query as unknown as QueryAuditLogsDto;

    const result = await this.queryAuditLogsUseCase.execute({
      companyId,
      page: query.page,
      limit: query.limit,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      from: query.from,
      to: query.to,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  }
}
