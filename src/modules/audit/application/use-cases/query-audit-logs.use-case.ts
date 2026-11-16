import { BadRequestError } from '../../../../shared/errors/app.error';
import { AuditLogRepository } from '../../domain/repositories/audit-log.repository';

export interface QueryAuditLogsInput {
  /** Obrigatório — vem do contexto de tenant, nunca do body. */
  companyId: number;
  page?: number;
  limit?: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
}

/**
 * Consulta paginada do trilho de auditoria de uma empresa.
 * Todos os filtros são aplicados DENTRO do companyId indicado.
 */
export class QueryAuditLogsUseCase {
  constructor(private readonly repository: AuditLogRepository) {}

  async execute(input: QueryAuditLogsInput) {
    const page = Math.max(1, Number(input.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(input.limit) || 20));

    if (!input.companyId || input.companyId <= 0) {
      throw new BadRequestError('Company context is required.');
    }

    const from = input.from ? new Date(input.from) : undefined;
    const to = input.to ? new Date(input.to) : undefined;

    if (from && Number.isNaN(from.getTime())) {
      throw new BadRequestError('Invalid date filter.');
    }

    if (to && Number.isNaN(to.getTime())) {
      throw new BadRequestError('Invalid date filter.');
    }

    const { rows, total } = await this.repository.list({
      companyId: input.companyId,
      page,
      limit,
      action: input.action || undefined,
      entityType: input.entityType || undefined,
      entityId: input.entityId || undefined,
      from,
      to,
    });

    return {
      data: rows.map((log) => log.toPrimitives()),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
