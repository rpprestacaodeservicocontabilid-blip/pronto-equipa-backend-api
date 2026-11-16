'use strict';
const permissions = [
  'reports:catalog:read',
  'reports:execute',
  'reports:executions:read',
  'reports:executions:cancel',
  'reports:hr:read',
  'reports:contracts:read',
  'reports:attendance:read',
  'reports:leave:read',
  'reports:salary:read',
  'reports:salary:read-sensitive',
  'reports:payroll:read',
  'reports:tax:read',
  'reports:payments:read',
  'reports:loans:read',
  'reports:payslips:read',
  'reports:custom:create',
  'reports:custom:update',
  'reports:custom:publish',
  'reports:custom:share',
  'reports:exports:create',
  'reports:exports:download',
  'reports:schedules:create',
  'reports:schedules:update',
  'reports:schedules:pause',
  'reports:kpis:read',
  'reports:dashboard:read',
  'reports:history:read',
  'reports:policies:manage',
  'reports:templates:manage',
];
module.exports = {
  async up(q, S) {
    await q.createTable('report_records', {
      id: { type: S.UUID, primaryKey: true, allowNull: false },
      companyId: {
        type: S.INTEGER,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'RESTRICT',
      },
      recordType: { type: S.STRING(40), allowNull: false },
      status: { type: S.STRING(30), allowNull: false },
      ownerUserId: { type: S.INTEGER, allowNull: true },
      code: { type: S.STRING(40), allowNull: true },
      payload: { type: S.JSON, allowNull: false, defaultValue: {} },
      createdAt: { type: S.DATE, allowNull: false },
      updatedAt: { type: S.DATE, allowNull: false },
    });
    await q.addIndex('report_records', ['companyId', 'recordType', 'createdAt'], {
      name: 'idx_report_records_tenant_type_date',
    });
    await q.addIndex('report_records', ['companyId', 'ownerUserId', 'recordType'], {
      name: 'idx_report_records_owner',
    });
    await q.addIndex('report_records', ['companyId', 'code', 'recordType'], {
      name: 'idx_report_records_code',
    });
    if (q.sequelize.getDialect() === 'postgres') {
      await q.sequelize.query('ALTER TABLE report_records ENABLE ROW LEVEL SECURITY');
      await q.sequelize.query('ALTER TABLE report_records FORCE ROW LEVEL SECURITY');
      await q.sequelize.query(
        `CREATE POLICY "report_records_tenant" ON "report_records" USING ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer) WITH CHECK ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)`,
      );
    }
    const [existing] = await q.sequelize.query('SELECT name FROM permissions');
    const known = new Set(existing.map((row) => row.name));
    const now = new Date();
    const rows = permissions
      .filter((name) => !known.has(name))
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
    if (q.sequelize.getDialect() === 'postgres')
      await q.sequelize.query('DROP POLICY IF EXISTS "report_records_tenant" ON "report_records"');
    await q.bulkDelete('permissions', { name: permissions });
    await q.dropTable('report_records');
  },
};
