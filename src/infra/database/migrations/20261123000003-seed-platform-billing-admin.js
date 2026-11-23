'use strict';

const permissions = [
  'accounts:manage', 'accounts:read', 'audit:read',
  'collections:read', 'credit-notes:download', 'credit-notes:issue',
  'credit-notes:read', 'debit-notes:issue', 'document-series:manage',
  'document-series:read', 'invoices:create', 'invoices:download',
  'invoices:issue', 'invoices:read', 'invoices:validate',
  'payments:allocate', 'payments:confirm', 'payments:create',
  'payments:read', 'receipts:download', 'receipts:read',
  'reconciliation:execute', 'reconciliation:read', 'reconciliation:reverse',
  'refunds:approve', 'refunds:create', 'refunds:execute',
  'refunds:read', 'reports:export', 'reports:read',
  'schedules:manage', 'schedules:read', 'tax-rules:manage',
  'tax-rules:read',
].map(grant => 'platform-billing:' + grant);

module.exports = {
  async up(q) {
    await q.sequelize.transaction(async transaction => {
      const [existing] = await q.sequelize.query('SELECT name, scope FROM permissions WHERE name IN (:permissions)', {
        replacements: { permissions }, transaction,
      });
      if (existing.some(row => row.scope !== 'PLATFORM')) throw new Error('Billing permission scope conflict.');
      const recorded = new Set(existing.map(row => row.name));
      const now = new Date();
      const additions = permissions.filter(name => !recorded.has(name)).map(name => ({
        name, scope: 'PLATFORM', isSystem: true, description: name,
        resource: name.slice(0, name.lastIndexOf(':')), action: name.split(':').pop(),
        createdAt: now, updatedAt: now,
      }));
      if (additions.length) await q.bulkInsert('permissions', additions, { transaction });
    });
  },
  async down() {
    throw new Error('Billing permission rollback requires reviewing existing role grants.');
  },
};
