/**
 * ============================================================
 * IN-MEMORY IDEMPOTENCY STORE — Módulo 03
 * (shared/infrastructure)
 * ============================================================
 *
 * Implementação do contrato `IdempotencyStore` em memória:
 * suficiente para dev/teste e para processos únicos.
 *
 *   - expiração lazy: entradas vencidas são removidas nas
 *     operações seguintes (sem timers que segurem o processo);
 *   - entradas `completed` são reemissíveis até expirarem;
 *   - a implementação de produção será transaccional e
 *     partilhada (ver lista de pendências do módulo).
 */

import type {
  IdempotencyEntry,
  IdempotencyStore,
} from "../application/idempotency";

export interface InMemoryIdempotencyOptions {
  /** TTL por omissão das entradas (ms). Omissão: 5 minutos. */
  defaultTtlMs?: number;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, IdempotencyEntry>();

  private readonly defaultTtlMs: number;

  constructor(options: InMemoryIdempotencyOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 5 * 60_000;
  }

  public async claim(key: string, ttlMs?: number): Promise<boolean> {
    this.prune();

    if (this.entries.has(key)) {
      // Entrada activa (in-progress ou completed reemissível):
      // o chamador deve primeiro `find` e só depois claimar.
      return false;
    }

    const now = new Date();

    this.entries.set(key, {
      key,
      status: "in-progress",
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.resolveTtl(ttlMs)),
    });

    return true;
  }

  public async complete<T>(
    key: string,
    response: T,
    ttlMs?: number,
  ): Promise<void> {
    this.prune();

    const now = new Date();
    const existing = this.entries.get(key);

    this.entries.set(key, {
      key,
      status: "completed",
      response,
      createdAt: existing?.createdAt ?? now,
      expiresAt: new Date(now.getTime() + this.resolveTtl(ttlMs)),
    });
  }

  public async find<T>(key: string): Promise<IdempotencyEntry<T> | null> {
    this.prune();

    return (this.entries.get(key) as IdempotencyEntry<T> | undefined) ?? null;
  }

  public async release(key: string): Promise<void> {
    this.entries.delete(key);
  }

  /** Remove entradas vencidas (chamado em cada operação). */
  private prune(): void {
    const now = Date.now();

    for (const [key, entry] of this.entries) {
      if (entry.expiresAt.getTime() <= now) {
        this.entries.delete(key);
      }
    }
  }

  private resolveTtl(ttlMs?: number): number {
    return typeof ttlMs === "number" && ttlMs > 0 ? ttlMs : this.defaultTtlMs;
  }
}
