'use strict';

const platform = [
  'access', 'tickets:read-team', 'tickets:update', 'tickets:assign', 'tickets:transfer',
  'tickets:resolve', 'tickets:close', 'tickets:reopen', 'messages:create',
  'internal-notes:create', 'internal-notes:read', 'sla:read', 'sla:manage',
  'queues:read', 'queues:manage', 'teams:read', 'teams:manage', 'agents:read', 'agents:manage',
  'incidents:read', 'incidents:create', 'incidents:manage', 'escalations:create', 'escalations:manage',
  'knowledge:read', 'knowledge:create', 'knowledge:update', 'knowledge:publish',
  'macros:read', 'macros:manage', 'automations:read', 'automations:manage',
  'surveys:read', 'reports:read', 'reports:export', 'audit:read',
].map(name => ({ name: 'platform:support:' + name, scope: 'PLATFORM' }));
const tenant = ['support:macros:read', 'support:automations:read'].map(name => ({ name, scope: 'TENANT' }));
const definitions = [...platform, ...tenant];

module.exports = {
  async up(q) {
    await q.sequelize.transaction(async transaction => {
      const names = definitions.map(item => item.name);
      const [existing] = await q.sequelize.query(
        'SELECT name, scope FROM permissions WHERE name IN (:names)', { replacements: { names }, transaction },
      );
      const now = new Date();
      const missing = [];
      for (const item of definitions) {
        const found = existing.find(row => row.name === item.name);
        if (found && found.scope !== item.scope) throw new Error('Support permission scope conflict.');
        if (!found) missing.push({
          ...item, description: item.name, isSystem: true, createdAt: now, updatedAt: now,
          resource: item.name.slice(0, item.name.lastIndexOf(':')), action: item.name.split(':').pop(),
        });
      }
      if (missing.length) await q.bulkInsert('permissions', missing, { transaction });
    });
  },
  async down() {
    throw new Error('Support access grants require a reviewed rollback.');
  },
};
