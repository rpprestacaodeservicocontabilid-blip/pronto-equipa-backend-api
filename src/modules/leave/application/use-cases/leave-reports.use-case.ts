import { LeaveRepository, LeaveReportQuery } from '../../domain/repositories/leave.repository';

/**
 * Caso de uso de RELATÓRIOS de férias: saldos por trabalhador e
 * dias gozados no período (RF-009/040/041).
 *
 * Todas as métricas derivam do ledger imutável de movimentos
 * (fonte de verdade — RN-010). Consultas sem escrita: sem
 * auditoria nem transacção.
 */
export class LeaveReportsUseCase {
  constructor(private readonly repository: LeaveRepository) {}

  /** Saldos paginados de todas as contas da empresa. */
  listBalances(companyId: number, query: { page: number; limit: number; employeeId?: string }) {
    return this.repository.listBalances(companyId, query);
  }

  /** Σ de dias USAGE registados no intervalo — dias gozados. */
  getTakenDays(companyId: number, query: LeaveReportQuery): Promise<{ days: number }> {
    return this.repository.sumTakenDays(companyId, query).then((days) => ({ days }));
  }

  /** Saldo de uma conta específica (composições do ledger). */
  getBalance(companyId: number, accountId: string) {
    return this.repository.getBalance(companyId, accountId);
  }
}
