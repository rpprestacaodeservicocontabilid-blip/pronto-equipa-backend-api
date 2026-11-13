'use strict';

const names = [
  'payments:read', 'payments:instructions:create', 'payments:instructions:read', 'payments:instructions:cancel', 'payments:beneficiaries:manage', 'payments:history:read',
  'payments:batches:create', 'payments:batches:update', 'payments:batches:validate', 'payments:batches:submit', 'payments:batches:approve', 'payments:batches:reject',
  'payments:batches:execute', 'payments:orders:read', 'payments:orders:execute', 'payments:orders:status', 'payments:transactions:read', 'payments:reconciliation:execute',
  'payments:bank-accounts:read', 'payments:bank-accounts:manage', 'payments:bank-accounts:verify', 'payments:providers:read', 'payments:providers:manage',
  'payments:reconciliation:read', 'payments:reconciliation:resolve', 'payments:policies:read', 'payments:policies:manage', 'payments:reports:read', 'payments:export',
];

module.exports = {
  async up(q) {
    const [existing] = await q.sequelize.query('SELECT name FROM permissions');
    const namesAlreadyPresent = new Set(existing.map((row) => row.name));
    const now = new Date();
    const rows = names.filter((name) => !namesAlreadyPresent.has(name)).map((name) => ({
      name, description: name, resource: name.slice(0, name.lastIndexOf(':')),
      action: name.slice(name.lastIndexOf(':') + 1), scope: 'TENANT', isSystem: true, createdAt: now, updatedAt: now,
    }));
    if (rows.length) await q.bulkInsert('permissions', rows);
  },
  async down(q) { await q.bulkDelete('permissions', { name: names }); },
};
