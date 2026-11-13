'use strict';
const names = [
  'payroll:periods:update',
  'payroll:runs:validate',
  'payroll:runs:process',
  'payroll:runs:retry',
  'payroll:results:read',
  'payroll:results:read-sensitive',
  'payroll:results:compare',
  'payroll:approvals:submit',
  'payroll:approvals:approve',
  'payroll:approvals:reject',
  'payroll:closing:execute',
  'payroll:corrections:create',
  'payroll:corrections:approve',
  'payroll:payments:prepare',
  'payroll:payments:read',
  'payroll:reports:read',
  'payroll:export',
  'payroll:history:read',
  'payroll:policies:manage',
];
module.exports = {
  async up(q) {
    const [existing] = await q.sequelize.query('SELECT name FROM permissions');
    const now = new Date();
    const rows = names
      .filter((name) => !existing.some((row) => row.name === name))
      .map((name) => ({
        name,
        description: name,
        resource: name.slice(0, name.lastIndexOf(':')),
        action: name.slice(name.lastIndexOf(':') + 1),
        scope: 'TENANT',
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      }));
    if (rows.length) await q.bulkInsert('permissions', rows);
  },
  async down(q) {
    await q.bulkDelete('permissions', { name: names });
  },
};
