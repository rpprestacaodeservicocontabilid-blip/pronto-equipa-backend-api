'use strict';
const { randomUUID } = require('crypto');
const permissions = [
  'notifications:templates:update',
  'notifications:deliveries:retry',
  'notifications:rules:read',
  'notifications:rules:manage',
  'notifications:reports:read',
  'notifications:send',
  'notifications:bulk:send',
  'notifications:campaigns:read',
  'notifications:campaigns:cancel',
  'notifications:templates:read',
  'notifications:templates:create',
  'notifications:templates:publish',
  'notifications:deliveries:read',
  'notifications:audit:read',
  'notifications:quotas:read',
];
module.exports = {
  async up(q, S) {
    await q.createTable('communication_records', {
      id: { type: S.UUID, primaryKey: true, allowNull: false },
      companyId: {
        type: S.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'RESTRICT',
      },
      scopeKey: { type: S.STRING(80), allowNull: false },
      kind: { type: S.STRING(40), allowNull: false },
      key: { type: S.STRING(240), allowNull: false },
      status: { type: S.STRING(40), allowNull: false },
      userId: { type: S.INTEGER, allowNull: true },
      data: { type: S.JSON, allowNull: false },
      createdAt: { type: S.DATE, allowNull: false },
      updatedAt: { type: S.DATE, allowNull: false },
    });
    await q.addIndex('communication_records', ['scopeKey', 'kind', 'key'], { unique: true });
    await q.addIndex('communication_records', ['companyId', 'userId', 'kind', 'status']);
    if (q.sequelize.getDialect() === 'postgres') {
      await q.sequelize.query('ALTER TABLE communication_records ENABLE ROW LEVEL SECURITY');
      await q.sequelize.query('ALTER TABLE communication_records FORCE ROW LEVEL SECURITY');
      await q.sequelize.query(
        `CREATE POLICY communication_scope ON communication_records USING (("companyId" IS NULL AND "scopeKey"='platform') OR "companyId"=NULLIF(current_setting('app.current_tenant',true),'')::integer) WITH CHECK (("companyId" IS NULL AND "scopeKey"='platform') OR "companyId"=NULLIF(current_setting('app.current_tenant',true),'')::integer)`,
      );
    }
    const [existing] = await q.sequelize.query('SELECT name FROM permissions');
    const now = new Date();
    const missing = permissions
      .filter((name) => !existing.some((p) => p.name === name))
      .map((name) => ({
        name,
        description: name,
        resource: name.slice(0, name.lastIndexOf(':')),
        action: name.split(':').pop(),
        scope: 'TENANT',
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      }));
    if (missing.length) await q.bulkInsert('permissions', missing);
    await q.bulkInsert('communication_records', [
      {
        id: randomUUID(),
        companyId: null,
        scopeKey: 'platform',
        kind: 'TEMPLATE',
        key: 'ONBOARDING_STATUS:1',
        status: 'PUBLISHED',
        userId: null,
        data: JSON.stringify({
          code: 'ONBOARDING_STATUS',
          category: 'ONBOARDING',
          version: 1,
          mandatory: true,
          actor: 0,
          publishedBy: 0,
          subject: 'Actualização da adesão',
          body: 'O estado da sua adesão é {{status}}. Aceda à plataforma para consultar os detalhes.',
        }),
        createdAt: now,
        updatedAt: now,
      },
    ]);
  },
  async down(q) {
    await q.dropTable('communication_records');
    await q.bulkDelete('permissions', { name: permissions });
  },
};
