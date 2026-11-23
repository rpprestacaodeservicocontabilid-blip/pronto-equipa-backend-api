'use strict';

const grants = [
  'access', 'campaigns:read', 'bulk:send', 'campaigns:cancel', 'templates:read', 'templates:create',
  'templates:update', 'templates:publish', 'deliveries:read', 'deliveries:retry', 'rules:read',
  'rules:manage', 'quotas:read', 'audit:read', 'reports:read', 'reports:export', 'providers:read',
].map(code => 'platform:notifications:' + code);

module.exports = {
  async up(q) {
    await q.sequelize.transaction(async transaction => {
      const [existing] = await q.sequelize.query('SELECT name, scope FROM permissions WHERE name IN (:grants)', {
        replacements: { grants }, transaction,
      });
      if (existing.some(row => row.scope !== 'PLATFORM')) throw new Error('Notification permission scope conflict.');
      const now = new Date();
      const missing = grants.filter(name => !existing.some(row => row.name === name));
      if (missing.length) await q.bulkInsert('permissions', missing.map(name => ({
        name, scope: 'PLATFORM', isSystem: true, description: name, resource: name.slice(0, name.lastIndexOf(':')),
        action: name.split(':').pop(), createdAt: now, updatedAt: now,
      })), { transaction });
    });
  },
  async down() {
    throw new Error('Notification access grants require a reviewed rollback.');
  },
};
