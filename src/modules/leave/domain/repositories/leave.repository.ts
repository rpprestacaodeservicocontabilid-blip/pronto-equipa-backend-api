import { LeaveAccountProps } from '../aggregates/leave-account.aggregate';
import { LeaveRequestProps } from '../aggregates/leave-request.aggregate';
import { LeaveBalanceProps, LeaveMovementType } from '../value-objects/leave-balance.vo';
import { LeaveStatus } from '../value-objects/leave-status.vo';

/** Consulta paginada de contas de férias. */
export interface LeaveAccountListQuery {
  page: number;
  limit: number;
  employeeId?: string;
  status?: string;
}

/** Consulta paginada de pedidos de férias. */
export interface LeaveRequestListQuery {
  page: number;
  limit: number;
  employeeId?: string;
  status?: LeaveStatus;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
}

export interface LeaveMovementRecord {
  id: number;
  companyId: number;
  accountId: string;
  entitlementId: string | null;
  movementType: LeaveMovementType;
  days: number;
  referenceId: string | null;
  reason: string | null;
  actorUserId: number | null;
  createdAt: Date;
}

export interface LeaveEntitlementRecord {
  id: string;
  companyId: number;
  accountId: string;
  accrualPeriodStart: string;
  accrualPeriodEnd: string;
  days: number;
  legalRuleVersionId: string | null;
  createdAt: Date;
}

export interface LeaveBalanceSummary extends LeaveBalanceProps {
  accountId: string;
  employeeId: string;
}

export interface LeavePeriodRecord {
  requestId: string;
  status: LeaveStatus;
  startDate: string;
  endDate: string;
  calculatedDays: number;
}

/** Período com o trabalhador — usado no planeamento de equipas. */
export interface LeaveAbsenceRecord extends LeavePeriodRecord {
  employeeId: string;
}

/** Filtros dos relatórios de saldo/gozo. */
export interface LeaveReportQuery {
  employeeId?: string;
  startDate?: string;
  endDate?: string;
}

export interface PaginatedLeave<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * Porta de LEITURA do módulo `leave`.
 *
 * Todas as consultas recebem `companyId` explícito do controlador
 * (contexto de tenant validado) — o isolamento é aplicado pela
 * aplicação, nunca pelo transport (RN-001..004).
 */
export interface LeaveRepository {
  findAccount(companyId: number, id: string): Promise<LeaveAccountProps | null>;

  findAccountByEmployee(
    companyId: number,
    employeeId: string,
  ): Promise<LeaveAccountProps | null>;

  listAccounts(
    companyId: number,
    query: LeaveAccountListQuery,
  ): Promise<PaginatedLeave<LeaveAccountProps>>;

  findRequest(companyId: number, id: string): Promise<LeaveRequestProps | null>;

  listRequests(
    companyId: number,
    query: LeaveRequestListQuery,
  ): Promise<PaginatedLeave<LeaveRequestProps>>;

  /** Ledger de movimentos de uma conta, ordenado por data. */
  listMovements(
    companyId: number,
    accountId: string,
    query: { page: number; limit: number; movementType?: LeaveMovementType },
  ): Promise<PaginatedLeave<LeaveMovementRecord>>;

  /** Saldo derivado dos movimentos (fonte de verdade). */
  getBalance(companyId: number, accountId: string): Promise<LeaveBalanceSummary | null>;

  listEntitlements(
    companyId: number,
    accountId: string,
  ): Promise<LeaveEntitlementRecord[]>;

  /** Períodos que se sobrepõem a um intervalo, para um trabalhador. */
  findOverlappingPeriods(
    companyId: number,
    employeeId: string,
    startDate: string,
    endDate: string,
    excludeRequestId?: string,
  ): Promise<LeavePeriodRecord[]>;

  /** Saldo de TODAS as contas da empresa (relatórios). */
  listBalances(
    companyId: number,
    query: LeaveAccountListQuery,
  ): Promise<PaginatedLeave<LeaveBalanceSummary>>;

  /** Σ dias USAGE registados no intervalo (dias gozados). */
  sumTakenDays(companyId: number, query: LeaveReportQuery): Promise<number>;

  /** Períodos bloqueantes que cobrem uma data, por trabalhador. */
  findAbsencesOnDate(companyId: number, date: string): Promise<LeaveAbsenceRecord[]>;

  /** Histórico completo de um pedido: períodos + decisões. */
  getRequestHistory(
    companyId: number,
    requestId: string,
  ): Promise<{
    periods: LeaveRequestProps['periods'];
    approvals: LeaveRequestProps['approvals'];
  }>;
}
