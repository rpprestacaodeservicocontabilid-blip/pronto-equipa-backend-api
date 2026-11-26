'use strict';
module.exports = {
  async up(q, S) {
    await q.createTable('platform_billing_records', {
      id: { type: S.UUID, primaryKey: true, allowNull: false },
      companyId: {
        type: S.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'RESTRICT',
      },
      kind: { type: S.STRING(40), allowNull: false },
      key: { type: S.STRING(240), allowNull: false },
      status: { type: S.STRING(40), allowNull: false },
      data: {
        type: q.sequelize.getDialect() === 'postgres' ? S.JSONB : S.JSON,
        allowNull: false,
      },
      createdAt: { type: S.DATE, allowNull: false },
      updatedAt: { type: S.DATE, allowNull: false },
    });
    await q.addIndex('platform_billing_records', ['companyId', 'kind', 'key'], {
      unique: true,
      name: 'uq_platform_billing_operation',
    });
    if (q.sequelize.getDialect() === 'postgres') {
      await q.sequelize.query('ALTER TABLE platform_billing_records ENABLE ROW LEVEL SECURITY');
      await q.sequelize.query('ALTER TABLE platform_billing_records FORCE ROW LEVEL SECURITY');
      await q.sequelize.query(
        `CREATE POLICY billing_tenant ON platform_billing_records USING ("companyId" = NULLIF(current_setting('app.current_tenant',true),'')::integer) WITH CHECK ("companyId" = NULLIF(current_setting('app.current_tenant',true),'')::integer)`,
      );
    }
    const now = new Date();
    const [rows] = await q.sequelize.query('SELECT name FROM permissions');
    const names = ['platform-billing:read', 'platform-billing:account:update'];
    const missing = names
      .filter((name) => !rows.some((r) => r.name === name))
      .map((name) => ({
        name,
        description: name,
        resource: 'platform-billing',
        action: name.endsWith('read') ? 'read' : 'update',
        scope: 'TENANT',
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      }));
    if (missing.length) await q.bulkInsert('permissions', missing);
  },
  async down(q) {
    await q.dropTable('platform_billing_records');
    await q.bulkDelete('permissions', {
      name: ['platform-billing:read', 'platform-billing:account:update'],
    });
  },
};
