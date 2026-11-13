'use strict';
const names = [
  'legal-rules:read',
  'legal-rules:create',
  'legal-rules:update',
  'legal-rules:submit',
  'legal-rules:approve',
  'legal-rules:publish',
  'legal-rules:retire',
];
module.exports = {
  async up(q) {
    const [existing] = await q.sequelize.query('SELECT name FROM permissions');
    const existingNames = new Set(existing.map((row) => row.name));
    const now = new Date();
    const missing = names.filter((name) => !existingNames.has(name)).map((name) => ({
      name,
      description: name,
      resource: name.slice(0, name.lastIndexOf(':')),
      action: name.slice(name.lastIndexOf(':') + 1),
      scope: 'PLATFORM',
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    }));
    if (missing.length) await q.bulkInsert('permissions', missing);
  },
  async down(q) {
    await q.bulkDelete('permissions', { name: names });
  },
};
