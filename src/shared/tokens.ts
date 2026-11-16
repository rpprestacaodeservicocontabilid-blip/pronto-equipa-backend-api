/**
 * ============================================================
 * SHARED TOKENS — Módulo 03 (shared)
 * ============================================================
 *
 * Tokens do contentor para os serviços da fundação
 * partilhada. Os módulos de negócio resolvem por ESTE token
 * (contrato), nunca por import directo do adaptador — o que
 * permite substituir a implementação em testes.
 */

export const SHARED_TOKENS = {
  /** `Clock` — tempo injectável (production `SystemClock`). */
  CLOCK: 'shared.clock',

  /** `TransactionManager` — transacções com contexto de tenant. */
  TRANSACTION_MANAGER: 'shared.transactionManager',

  /** `IdempotencyStore` — prevenção de duplicados. */
  IDEMPOTENCY_STORE: 'shared.idempotencyStore',

  /** `Telemetry` — métricas (implementação provisória noop). */
  TELEMETRY: 'shared.telemetry',
} as const;

export type SharedToken = (typeof SHARED_TOKENS)[keyof typeof SHARED_TOKENS];
