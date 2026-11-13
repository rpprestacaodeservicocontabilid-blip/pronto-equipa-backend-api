/**
 * ============================================================
 * TRANSACTION MANAGER — Módulo 03 (shared/application)
 * ============================================================
 *
 * Contrato de transacções, independente do ORM: o domínio e
 * os casos de uso dependem DESTE contrato — não do Sequelize.
 *
 * Em produção há uma implementação Sequelize
 * (`shared/infrastructure/sequelize-transaction-manager.ts`);
 * em testes basta registar um fake no contentor.
 *
 * `options.tenantId` torna a empresa activa DENTRO da
 * transacção (isolamento multiempresa aplicado pela
 * aplicação, dado que não usamos PostgreSQL/RLS).
 */

export interface TransactionOptions {
  /**
   * Identificador da empresa (tenant) a tornar activo dentro
   * da transacção. Obter sempre de contexto autenticado e
   * autorizado — nunca directamente do pedido.
   */
  tenantId?: number | null;
}

/** Contexto da transacção entregue ao callback (2.º argumento). */
export interface TransactionScope {
  /** Tenant activo durante a transacção (`null` = global). */
  tenantId: number | null;
}

export interface TransactionManager<THandle = unknown> {
  /**
   * Executa `callback` dentro de uma transacção.
   *
   *  - commit quando o callback resolve;
   *  - rollback quando o callback lança/rejeita (o erro
   *    original é propagado);
   *  - `scope.tenantId` reflecte o tenant da transacção.
   */
  run<T>(
    callback: (handle: THandle, scope: TransactionScope) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;
}
