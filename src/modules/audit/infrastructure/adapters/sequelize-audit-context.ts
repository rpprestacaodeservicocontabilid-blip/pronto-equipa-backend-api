import { Transaction, QueryTypes } from 'sequelize';
import { sequelize } from '../../../../infra/database';
import { auditRequestContext } from '../../../../shared/infrastructure/context/audit-request-context';
let installed = false;
export function installAuditTransactionContext() {
  if (installed) return;
  installed = true;
  const stamped = new WeakSet<Transaction>();
  const stamp = async (options: { transaction?: Transaction | null }) => {
    const context = auditRequestContext.getStore(),
      transaction = options.transaction;
    if (
      !context ||
      !transaction ||
      stamped.has(transaction) ||
      sequelize.getDialect() !== 'postgres'
    )
      return;
    stamped.add(transaction);
    await sequelize.query(
      "SELECT set_config('app.audit_actor',:actor,true), set_config('app.audit_correlation',:correlation,true)",
      {
        replacements: {
          actor: context.actor() ? String(context.actor()) : '',
          correlation: context.requestId,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
  };
  sequelize.addHook('beforeCreate', (_row, options) => stamp(options));
  sequelize.addHook('beforeUpdate', (_row, options) => stamp(options));
  sequelize.addHook('beforeBulkCreate', (_rows, options) => stamp(options));
  sequelize.addHook('beforeBulkUpdate', (options) => stamp(options));
  sequelize.addHook('beforeDestroy', (_row, options) => stamp(options));
  sequelize.addHook('beforeBulkDestroy', (options) => stamp(options));
}
