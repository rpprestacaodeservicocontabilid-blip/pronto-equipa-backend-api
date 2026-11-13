'use strict';
const names = [
  'payroll:read',
  'payroll:periods:create',
  'payroll:periods:open',
  'payroll:periods:close',
  'payroll:runs:create',
  'payroll:runs:cancel',
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
