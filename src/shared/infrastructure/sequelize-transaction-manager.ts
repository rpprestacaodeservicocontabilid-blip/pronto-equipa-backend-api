/**
 * ============================================================
 * SEQUELIZE TRANSACTION MANAGER — Módulo 03
 * (shared/infrastructure)
 * ============================================================
 *
 * Implementação do contrato `TransactionManager` sobre a
 * stack acordada (Sequelize 6 + SQLite dev/test, MySQL 8 prod).
 *
 *   - commit no sucesso, rollback no erro (garantido pelo
 *     próprio `sequelize.transaction`);
 *   - o `tenantId` dado em opções fica activo dentro da
 *     transacção via `AsyncLocalStorage` — é aí que os
 *     repositórios/filtros por empresa o leem (sem RLS).
 *
 * A aplicação recebe SEMPRE a instância pelo contentor
 * (contrato), pelo que os testes podem substituí-la.
 */

import type { Transaction } from 'sequelize';

import { sequelize } from '../../infra/database';
import type {
  TransactionManager,
  TransactionOptions,
  TransactionScope,
} from '../application/transaction-manager';
import { runWithTenant } from './tenant-context';

export class SequelizeTransactionManager implements TransactionManager<Transaction> {
  public async run<T>(
    callback: (handle: Transaction, scope: TransactionScope) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    const tenantId = options.tenantId ?? null;

    return sequelize.transaction(async (transaction) => {
      const scope: TransactionScope = { tenantId };

      return runWithTenant(tenantId, () => callback(transaction, scope));
    });
  }
}
