'use strict';

const tables = [
  'payslips', 'payslip_batches', 'payslip_publications', 'payslip_documents',
  'payslip_deliveries', 'payslip_outbox', 'payslip_access_logs',
];
const name = (table) => 'idx_' + table + '_company_created';

module.exports = {
  async up(q) {
    const dialect = q.sequelize.getDialect();
    if (dialect !== 'postgres') {
      for (const table of tables) {
        const indexes = await q.showIndex(table);
        if (!indexes.some((index) => index.name === name(table)))
          await q.addIndex(table, ['companyId', 'createdAt'], { name: name(table) });
      }
      return;
    }
    for (const table of tables) {
      await q.sequelize.query(
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS "' + name(table) + '" ON "' + table + '" ("companyId", "createdAt")',
      );
    }
  },
  async down(q) {
    if (q.sequelize.getDialect() !== 'postgres') {
      for (const table of tables) await q.removeIndex(table, name(table)).catch(() => undefined);
      return;
    }
    for (const table of tables)
      await q.sequelize.query('DROP INDEX CONCURRENTLY IF EXISTS "' + name(table) + '"');
  },
};

