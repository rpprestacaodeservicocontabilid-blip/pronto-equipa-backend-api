/**
 * ============================================================
 * TENANT CONTEXT — Módulo 03 (shared/infrastructure)
 * ============================================================
 *
 * Contexto de tenant (empresa) baseado em `AsyncLocalStorage`
 * para compensar a ausência de RLS no SQLite/MySQL:
 *
 *   - `runWithTenant(id, fn)` activa a empresa durante `fn`
 *     (invocado pelo `SequelizeTransactionManager`);
 *   - `currentTenantId()` é legível por qualquer código
 *     dentro do fluxo (repositórios, auditoria);
 *   - fora de um fluxo activo devolve `null` (global) —
 *     NUNCA infere do pedido.
 *
 * O valor é sempre o que foi validado pela aplicação
 * (token + membership), nunca o `X-Company-Id` bruto.
 */

import { AsyncLocalStorage } from 'async_hooks';

export interface TenantScope {
  /** Empresa activa. `null` = contexto global (sem tenant). */
  tenantId: number | null;
}

const storage = new AsyncLocalStorage<TenantScope>();

/** Executa `fn` com o tenant activo (isolamento por aplicação). */
export function runWithTenant<T>(tenantId: number | null, fn: () => T): T {
  return storage.run({ tenantId }, fn);
}

/** Tenant activo no fluxo actual, ou `null` se não houver. */
export function currentTenantId(): number | null {
  return storage.getStore()?.tenantId ?? null;
}

/** Escopo completo do fluxo actual (`null` fora de um fluxo). */
export function currentTenant(): TenantScope | null {
  return storage.getStore() ?? null;
}
