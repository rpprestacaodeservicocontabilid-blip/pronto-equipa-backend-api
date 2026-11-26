import { Transaction, QueryTypes } from 'sequelize';
import { sequelize } from '../../../../infra/database';
import { auditRequestContext } from '../../../../shared/infrastructure/context/audit-request-context';
let installed = false;
export function installAuditTransactionContext() {
  if (installed) return;
  installed = true;
  const stamped = new WeakSet<Transaction>();
  if (sequelize.getDialect() === 'mysql') {
    sequelize.addHook('afterPoolAcquire', 'clear-mysql-audit-session-context', async (connection: any) => {
      await connection.promise().query('SET @app_audit_actor = NULL, @app_audit_correlation = NULL');
    });
  }
  const stamp = async (options: { transaction?: Transaction | null }) => {
    const context = auditRequestContext.getStore(),
      { transaction } = options;
    if (!context || !transaction || stamped.has(transaction)) return;
    const dialect = sequelize.getDialect();
    if (dialect !== 'postgres' && dialect !== 'mysql') return;
    stamped.add(transaction);
    const actor = context.actor() ? String(context.actor()) : '',
      correlation = context.requestId;
    if (dialect === 'postgres') {
      await sequelize.query(
        "SELECT set_config('app.audit_actor',:actor,true), set_config('app.audit_correlation',:correlation,true)",
        { replacements: { actor, correlation }, type: QueryTypes.SELECT, transaction },
      );
    } else {
      await sequelize.query('SET @app_audit_actor = :actor, @app_audit_correlation = :correlation', {
        replacements: { actor: actor || null, correlation: correlation || null },
        transaction,
      });
    }
  };
  sequelize.addHook('beforeCreate', (_row, options) => stamp(options));
  sequelize.addHook('beforeUpdate', (_row, options) => stamp(options));
  sequelize.addHook('beforeBulkCreate', (_rows, options) => stamp(options));
  sequelize.addHook('beforeBulkUpdate', (options) => stamp(options));
  sequelize.addHook('beforeDestroy', (_row, options) => stamp(options));
  sequelize.addHook('beforeBulkDestroy', (options) => stamp(options));
}
