import { LeaveAccountProps } from '../aggregates/leave-account.aggregate';
import { LeaveRequestProps } from '../aggregates/leave-request.aggregate';

/**
 * Porta de ESCRITA do módulo `leave`.
 *
 * Cada método executa numa ÚNICA transacção com o contexto de
 * tenant aplicado (`set_config('app.current_tenant')` em
 * PostgreSQL) e com as contas bloqueadas (`FOR UPDATE`) sempre
 * que o saldo é validado — é isto que garante a atomicidade das
 * aprovações concorrentes (CA-009 / RNF-004).
 *
 * Os eventos de domínio produzidos são escritos em
 * `leave_outbox` na MESMA transacção (outbox transaccional).
 */
export interface LeaveWorkUnit {
  /** Cria a conta de férias (RF-001). Recusa duplicados (CA-002). */
  createAccount(input: {
    companyId: number;
    employeeId: string;
    actorUserId: number;
  }): Promise<LeaveAccountProps>;

  /** Regista um direito adquirido + movimento ACCRUAL (RF-002/005). */
  accrueEntitlement(input: {
    companyId: number;
    accountId: string;
    accrualPeriodStart: string;
    accrualPeriodEnd: string;
    days: number;
    legalRuleVersionId?: string | null;
    actorUserId: number;
  }): Promise<{ entitlementId: string; movementId: number }>;

  /** Ajuste justificado do saldo (RF-008 / RN-013). */
  adjustBalance(input: {
    companyId: number;
    accountId: string;
    days: number;
    reason: string;
    referenceId?: string | null;
    actorUserId: number;
  }): Promise<{ movementId: number }>;

  /** Cria o pedido em DRAFT com os períodos calculados (RF-013/017). */
  createRequest(input: {
    companyId: number;
    employeeId: string;
    accountId: string;
    leaveType?: string;
    reason?: string | null;
    segments: Array<{ startDate: string; endDate: string; calculatedDays: number }>;
    actorUserId: number;
  }): Promise<LeaveRequestProps>;

  /** Actualiza um pedido em DRAFT (RF-016). */
  updateDraftRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    leaveType?: string;
    reason?: string | null;
    segments?: Array<{ startDate: string; endDate: string; calculatedDays: number }>;
    actorUserId: number;
  }): Promise<LeaveRequestProps>;

  /** Submete para aprovação (RF-020) — valida sobreposições (RN-017). */
  submitRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    actorUserId: number;
  }): Promise<LeaveRequestProps>;

  /**
   * Aprova e reserva o saldo ATOMICAMENTE (RF-025 / RN-018):
   * revalida saldo e conflitos com a conta bloqueada.
   */
  approveRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    comments?: string | null;
    actorUserId: number;
    allowSelfApproval?: boolean;
  }): Promise<LeaveRequestProps>;

  /** Rejeita com justificação — não consome saldo (RF-026 / RN-019). */
  rejectRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    comments: string;
    actorUserId: number;
    allowSelfApproval?: boolean;
  }): Promise<LeaveRequestProps>;

  /** Devolve para correcção (RF-027). */
  returnRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    comments?: string | null;
    actorUserId: number;
    allowSelfApproval?: boolean;
  }): Promise<LeaveRequestProps>;

  /** Cancela e liberta a reserva quando aplicável (RF-021 / RN-020). */
  cancelRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    actorUserId: number;
  }): Promise<LeaveRequestProps>;

  /** Reagenda preservando o histórico e ajustando reservas (RF-022). */
  rescheduleRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    segments: Array<{ startDate: string; endDate: string; calculatedDays: number }>;
    actorUserId: number;
  }): Promise<LeaveRequestProps>;

  /** Confirma o início do período de férias (RF-042). */
  startRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    actorUserId: number;
  }): Promise<LeaveRequestProps>;

  /** Regista interrupção autorizada (RF-045). */
  interruptRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    startDate: string;
    endDate: string;
    reason: string;
    actorUserId: number;
  }): Promise<LeaveRequestProps>;

  /**
   * Conclui as férias convertendo a reserva em utilização,
   * sem dupla contabilização (§10.2 / CA-012/013).
   */
  completeRequest(input: {
    companyId: number;
    requestId: string;
    expectedVersion: number;
    /** Dias efectivamente gozados — por omissão, todos os pedidos. */
    usedDays?: number;
    actorUserId: number;
  }): Promise<LeaveRequestProps>;

  /**
   * Recálculo controlado de direitos após alteração contratual
   * (RF-010 / RN-009): produz movimentos de regularização sem
   * apagar direitos consolidados.
   */
  recalculateEntitlements(input: {
    companyId: number;
    accountId: string;
    accrualPeriodStart: string;
    accrualPeriodEnd: string;
    days: number;
    legalRuleVersionId?: string | null;
    actorUserId: number;
  }): Promise<{ entitlementId: string; adjustmentDays: number }>;
}
