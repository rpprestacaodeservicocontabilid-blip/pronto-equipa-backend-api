'use strict';

const grants = [
  'payments.platform.read',
  'payments.platform.integrations.read',
  'payments.platform.reports.read',
  'payments.platform.audit.read',
  'payments.platform.policies.read',
];

module.exports = {
  async up(q) {
    await q.sequelize.transaction(async transaction => {
      const select = async (sql, replacements = {}) => {
        const [rows] = await q.sequelize.query(sql, { replacements, transaction });
        return rows;
      };
      const now = new Date();
      const existing = await select('SELECT id, name, scope FROM permissions WHERE name IN (:grants)', { grants });
      if (existing.some(row => row.scope !== 'PLATFORM')) throw new Error('Platform payment permission scope conflict.');
      const missing = grants.filter(name => !existing.some(row => row.name === name));
      if (missing.length) {
        await q.bulkInsert('permissions', missing.map(name => ({
          name, description: name, scope: 'PLATFORM', isSystem: true,
          resource: name.slice(0, name.lastIndexOf('.')), action: 'read', createdAt: now, updatedAt: now,
        })), { transaction });
      }
      const quote = name => q.quoteIdentifier(name);
      const roles = await select(`SELECT id FROM roles WHERE name = 'SUPER_ADMIN' AND ${quote('companyId')} IS NULL`);
      const permissions = await select('SELECT id FROM permissions WHERE name IN (:grants)', { grants });
      for (const role of roles) {
        const assigned = await select(`SELECT ${quote('permissionId')} FROM role_permissions WHERE ${quote('roleId')} = :id`, { id: role.id });
        const items = permissions.filter(permission => !assigned.some(row => row.permissionId === permission.id));
        if (items.length) {
          await q.bulkInsert('role_permissions', items.map(permission => ({
            roleId: role.id, permissionId: permission.id, createdAt: now,
          })), { transaction });
        }
      }
    });
  },
  async down(q) {
    await q.sequelize.transaction(async transaction => {
      const [permissions] = await q.sequelize.query(
        "SELECT id FROM permissions WHERE scope = 'PLATFORM' AND name IN (:grants)", { replacements: { grants }, transaction },
      );
      if (permissions.length) {
        await q.bulkDelete('role_permissions', { permissionId: permissions.map(row => row.id) }, { transaction });
        await q.bulkDelete('permissions', { id: permissions.map(row => row.id) }, { transaction });
      }
    });
  },
};
