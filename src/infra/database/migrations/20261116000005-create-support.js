'use strict';
const { randomUUID } = require('crypto');
const permissions = [
  'support:tickets:create',
  'support:tickets:read-own',
  'support:tickets:read-team',
  'support:tickets:read-all',
  'support:tickets:update',
  'support:tickets:assign',
  'support:tickets:transfer',
  'support:tickets:resolve',
  'support:tickets:close',
  'support:tickets:reopen',
  'support:messages:create',
  'support:messages:read',
  'support:internal-notes:create',
  'support:internal-notes:read',
  'support:attachments:upload',
  'support:attachments:read',
  'support:queues:read',
  'support:queues:manage',
  'support:teams:read',
  'support:teams:manage',
  'support:agents:read',
  'support:agents:manage',
  'support:sla:read',
  'support:sla:manage',
  'support:incidents:create',
  'support:incidents:read',
  'support:incidents:manage',
  'support:escalations:create',
  'support:escalations:manage',
  'support:knowledge:read',
  'support:knowledge:create',
  'support:knowledge:update',
  'support:knowledge:publish',
  'support:macros:manage',
  'support:automations:manage',
  'support:surveys:read',
  'support:surveys:submit',
  'support:reports:read',
  'support:reports:export',
  'support:audit:read',
];

module.exports = {
  async up(q, S) {
    await q.createTable('support_records', {
      id: { type: S.UUID, primaryKey: true, allowNull: false },
      companyId: {
        type: S.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'RESTRICT',
      },
      scopeKey: { type: S.STRING(100), allowNull: false },
      kind: { type: S.STRING(50), allowNull: false },
      key: { type: S.STRING(240), allowNull: false },
      status: { type: S.STRING(40), allowNull: false },
      userId: { type: S.INTEGER, allowNull: true },
      data: { type: S.JSON, allowNull: false },
      createdAt: { type: S.DATE, allowNull: false },
      updatedAt: { type: S.DATE, allowNull: false },
    });
    await q.addIndex('support_records', ['scopeKey', 'kind', 'key'], { unique: true });
    await q.addIndex('support_records', ['companyId', 'kind', 'status', 'createdAt']);
    await q.addIndex('support_records', ['companyId', 'userId', 'kind', 'createdAt']);

    if (q.sequelize.getDialect() === 'postgres') {
      await q.sequelize.query('ALTER TABLE support_records ENABLE ROW LEVEL SECURITY');
      await q.sequelize.query('ALTER TABLE support_records FORCE ROW LEVEL SECURITY');
      await q.sequelize.query(
        `CREATE POLICY support_scope ON support_records USING (("companyId" IS NULL AND "scopeKey"='platform') OR "companyId"=NULLIF(current_setting('app.current_tenant',true),'')::integer) WITH CHECK (("companyId" IS NULL AND "scopeKey"='platform') OR "companyId"=NULLIF(current_setting('app.current_tenant',true),'')::integer)`,
      );
    }

    const [existing] = await q.sequelize.query('SELECT name FROM permissions');
    const now = new Date();
    const missing = permissions
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
    if (missing.length) await q.bulkInsert('permissions', missing);

    await q.bulkInsert('support_records', [{
      id: randomUUID(),
      companyId: null,
      scopeKey: 'platform',
      kind: 'SLA_POLICY',
      key: 'DEFAULT:1',
      status: 'ACTIVE',
      userId: null,
      data: JSON.stringify({
        code: 'DEFAULT',
        version: 1,
        firstResponseHours: 24,
        resolutionHours: 120,
        businessDays: [1, 2, 3, 4, 5],
        businessStartHour: 9,
        businessEndHour: 17,
        baseline: true,
      }),
      createdAt: now,
      updatedAt: now,
    }]);
  },
  async down(q) {
    await q.dropTable('support_records');
    await q.bulkDelete('permissions', { name: permissions });
  },
};
