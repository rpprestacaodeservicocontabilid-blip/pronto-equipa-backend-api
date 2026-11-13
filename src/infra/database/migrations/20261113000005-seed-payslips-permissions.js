'use strict';
const names = [
  'payslips:read',
  'payslips:read-sensitive',
  'payslips:employees:link',
  'payslips:generate',
  'payslips:generate-batch',
  'payslips:retry-generation',
  'payslips:publish',
  'payslips:publish-batch',
  'payslips:download',
  'payslips:print',
  'payslips:templates:create',
  'payslips:templates:update',
  'payslips:templates:publish',
  'payslips:corrections:create',
  'payslips:corrections:read',
  'payslips:verification:read',
  'payslips:history:read',
  'payslips:reports:read',
  'payslips:export',
  'payslips:policies:manage',
  'payslips:self:read',
  'payslips:self:download',
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
