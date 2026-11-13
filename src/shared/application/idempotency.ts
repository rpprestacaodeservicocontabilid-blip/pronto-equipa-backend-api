/**
 * ============================================================
 * IDEMPOTENCY — Módulo 03 (shared/application)
 * ============================================================
 *
 * Contrato de prevenção de operações duplicadas (ex.: criar
 * empresa/salário duas vezes com o mesmo `Idempotency-Key`).
 *
 * Fluxo típico pelo chamador:
 *
 *   1. `find(key)` → se `completed`, reemite a resposta;
 *   2. `claim(key)` → `false` significa duplicado concorrente;
 *   3. executar a operação;
 *   4. `complete(key, response)` em sucesso,
 *      `release(key)` em falha (permite nova tentativa).
 *
 * Em memória (`shared/infrastructure/in-memory-idempotency-store`)
 * para dev/teste; em produção será persistido transaccionalmente.
 */

export type IdempotencyStatus = "in-progress" | "completed";

export interface IdempotencyEntry<T = unknown> {
  key: string;
  status: IdempotencyStatus;
  /** Resposta gravada em `completed` — usada na reemissão. */
  response?: T;
  createdAt: Date;
  /** Após este instante a entrada pode ser reclamada de novo. */
  expiresAt: Date;
}

export interface IdempotencyStore {
  /**
   * Reclama a chave para o chamador actual.
   * `false` quando já existe uma entrada activa (duplicado).
   */
  claim(key: string, ttlMs?: number): Promise<boolean>;

  /** Conclui a operação e guarda a resposta para reemissão. */
  complete<T>(key: string, response: T, ttlMs?: number): Promise<void>;

  /** Devolve a entrada activa ou `null` (expirada/inexistente). */
  find<T>(key: string): Promise<IdempotencyEntry<T> | null>;

  /** Liberta a chave (falha da operação — nova tentativa). */
  release(key: string): Promise<void>;
}
