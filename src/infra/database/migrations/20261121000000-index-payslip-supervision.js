'use strict';

const tables = [
  'payslips', 'payslip_batches', 'payslip_publications', 'payslip_documents',
  'payslip_deliveries', 'payslip_outbox', 'payslip_access_logs',
];
const name = (table) => 'idx_' + table + '_company_created';

module.exports = {
  async up(q) {
    const concurrently = q.sequelize.getDialect() === 'postgres' ? ' CONCURRENTLY' : '';
    for (const table of tables) {
      await q.sequelize.query(
        'CREATE INDEX' + concurrently + ' IF NOT EXISTS "' + name(table) + '" ON "' + table + '" ("companyId", "createdAt")',
      );
    }
  },
  async down(q) {
    const concurrently = q.sequelize.getDialect() === 'postgres' ? ' CONCURRENTLY' : '';
    for (const table of tables) await q.sequelize.query('DROP INDEX' + concurrently + ' IF EXISTS "' + name(table) + '"');
  },
};

