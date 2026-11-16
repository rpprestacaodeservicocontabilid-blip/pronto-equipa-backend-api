import { AuditLog } from '../entities/audit-log';

export interface ListAuditLogsParams {
  /** Obrigatório — âmbito da empresa (tenant). */
  companyId: number;
  page: number;
  limit: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
}

export interface PaginatedAuditLogs {
  rows: AuditLog[];
  total: number;
}

/**
 * Repositório de auditoria.
 *
 * `companyId` é obrigatório em todas as leituras — não existe
 * consulta de auditoria sem âmbito de empresa.
 */
export interface AuditLogRepository {
  save(log: AuditLog): Promise<AuditLog>;

  list(params: ListAuditLogsParams): Promise<PaginatedAuditLogs>;
}
