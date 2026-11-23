import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import type { AiUnitOfWorkPort } from '../../../application/ports/ai-unit-of-work.port';
import { runWithAiTransaction } from '../ai-transaction-context';

/**
 * Unidade de trabalho multi-repositório (RN-AI-008, secção 10.3).
 *
 * Cada operação corre numa transacção única com o contexto de tenant
 * aplicado:
 *
 *   - em PostgreSQL define `app.current_tenant` para as policies RLS
 *     (defesa em profundidade — o filtro por `companyId` da
 *     aplicação continua a ser obrigatório);
 *   - publica o âmbito transaccional para que os repositórios
 *     participem na MESMA transacção;
 *   - um erro faz rollback da operação inteira, nunca deixa
 *     transições de estado pela metade.
 */
export class SequelizeAiUnitOfWork implements AiUnitOfWorkPort {
  async run<T>(tenantId: number, operation: () => Promise<T>): Promise<T> {
    if (!Number.isSafeInteger(tenantId) || tenantId <= 0)
      throw new Error('Contexto de empresa inválido para a unidade de trabalho.');

    return sequelize.transaction(async (transaction: Transaction) => {
      if (sequelize.getDialect() === 'postgres') {
        await sequelize.query("SELECT set_config('app.current_tenant', :companyId, true)", {
          replacements: { companyId: String(tenantId) },
          type: QueryTypes.SELECT,
          transaction,
        });
      }
      return runWithAiTransaction({ tenantId, transaction }, operation);
    });
  }
}
