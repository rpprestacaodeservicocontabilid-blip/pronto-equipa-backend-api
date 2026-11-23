import { AsyncLocalStorage } from 'async_hooks';
import type { Transaction } from 'sequelize';

/**
 * Âmbito transaccional do assistente.
 *
 * A unidade de trabalho (`AiUnitOfWorkPort`) abre a transacção e
 * publica o âmbito; os repositórios procuram activamente o âmbito
 * para participar na MESMA transacção — sem que a camada de
 * aplicação precise de conhecer o ORM.
 */
export interface AiTransactionScope {
  tenantId: number;
  transaction: Transaction;
}

const storage = new AsyncLocalStorage<AiTransactionScope>();

/** Executa a operação com o âmbito transaccional activo. */
export function runWithAiTransaction<T>(
  scope: AiTransactionScope,
  operation: () => Promise<T>,
): Promise<T> {
  return storage.run(scope, operation);
}

/** Âmbito activo, quando existe (fora de uma unidade de trabalho). */
export function currentAiTransactionScope(): AiTransactionScope | undefined {
  return storage.getStore();
}

/**
 * Opções de query: junta a transacção corrente quando existe.
 * Fora de uma transacção devolve `{}` (auto-commit por query).
 */
export function aiQueryOptions(): { transaction?: Transaction } {
  const scope = storage.getStore();
  return scope ? { transaction: scope.transaction } : {};
}
