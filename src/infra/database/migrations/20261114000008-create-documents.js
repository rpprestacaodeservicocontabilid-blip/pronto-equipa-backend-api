'use strict';
const tables = [
  'documents',
  'document_versions',
  'document_files',
  'document_upload_sessions',
  'document_upload_parts',
  'document_batches',
  'document_batch_items',
  'document_categories',
  'document_types',
  'document_associations',
  'document_validations',
  'document_approvals',
  'document_access_grants',
  'document_access_logs',
  'document_expiry_alerts',
  'document_retention_policies',
  'document_legal_holds',
  'document_deletion_requests',
  'document_processing_jobs',
  'document_storage_usage',
  'document_policies',
  'document_outbox',
];
const unique = [
  'documents',
  'document_versions',
  'document_files',
  'document_upload_sessions',
  'document_batches',
  'document_batch_items',
  'document_categories',
  'document_types',
  'document_associations',
  'document_access_grants',
  'document_expiry_alerts',
  'document_retention_policies',
  'document_deletion_requests',
  'document_storage_usage',
  'document_policies',
];
const permissions = [
  'documents:read',
  'documents:read-sensitive',
  'documents:upload',
  'documents:upload-bulk',
  'documents:metadata:update',
  'documents:classify',
  'documents:download',
  'documents:preview',
  'documents:versions:create',
  'documents:versions:read',
  'documents:validation:submit',
  'documents:validation:approve',
  'documents:validation:reject',
  'documents:associations:create',
  'documents:associations:delete',
  'documents:archive',
  'documents:restore',
  'documents:deletion:request',
  'documents:deletion:approve',
  'documents:legal-holds:create',
  'documents:legal-holds:release',
  'documents:categories:manage',
  'documents:types:manage',
  'documents:policies:manage',
  'documents:storage:read',
  'documents:audit:read',
];
module.exports = {
  async up(q, S) {
    for (const table of tables) {
      await q.createTable(table, {
        id: { type: S.UUID, primaryKey: true, allowNull: false },
        companyId: {
          type: S.INTEGER,
          allowNull: false,
          references: { model: 'companies', key: 'id' },
          onDelete: 'RESTRICT',
        },
        status: { type: S.STRING(40), allowNull: false },
        runId: { type: S.UUID, allowNull: true },
        employeeId: { type: S.UUID, allowNull: true },
        key: { type: S.STRING(240), allowNull: false },
        version: { type: S.INTEGER, allowNull: false, defaultValue: 1 },
        data: { type: S.JSON, allowNull: false },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false },
      });
      await q.addIndex(table, ['companyId', 'id'], { unique: true, name: `uq_${table}_tenant_id` });
      await q.addIndex(table, ['companyId', 'runId', 'status'], { name: `ix_${table}_run_status` });
      await q.addIndex(table, ['companyId', 'employeeId', 'status'], {
        name: `ix_${table}_employee_status`,
      });
      if (unique.includes(table))
        await q.addIndex(table, ['companyId', 'key'], { unique: true, name: `uq_${table}_key` });
      if (q.sequelize.getDialect() === 'postgres') {
        await q.sequelize.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
        await q.sequelize.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
        await q.sequelize.query(
          `CREATE POLICY "${table}_tenant" ON "${table}" USING ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer) WITH CHECK ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)`,
        );
      }
    }
    if (q.sequelize.getDialect() === 'postgres') {
      for (const [table, parent] of [
        ['document_versions', 'documents'],
        ['document_files', 'document_versions'],
        ['document_upload_sessions', 'documents'],
        ['document_associations', 'documents'],
        ['document_validations', 'documents'],
        ['document_approvals', 'documents'],
        ['document_access_logs', 'documents'],
        ['document_legal_holds', 'documents'],
        ['document_deletion_requests', 'documents'],
      ])
        await q.sequelize.query(
          `ALTER TABLE "${table}" ADD CONSTRAINT "fk_${table}_tenant_parent" FOREIGN KEY ("companyId","runId") REFERENCES "${parent}" ("companyId","id") ON DELETE RESTRICT`,
        );
      await q.sequelize.query(
        "ALTER TABLE document_versions ADD CONSTRAINT ck_document_versions_immutable_status CHECK (status IN ('PENDING_UPLOAD','UPLOADED','SCANNING','PENDING_VALIDATION','ACTIVE','REJECTED','QUARANTINED','ARCHIVED','EXPIRED','DELETED'))",
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
    if (q.sequelize.getDialect() === 'postgres') {
      for (const table of tables)
        await q.sequelize.query(`DROP POLICY IF EXISTS "${table}_tenant" ON "${table}"`);
      for (const table of [
        'document_versions',
        'document_files',
        'document_upload_sessions',
        'document_associations',
        'document_validations',
        'document_approvals',
        'document_access_logs',
        'document_legal_holds',
        'document_deletion_requests',
      ])
        await q.sequelize.query(
          `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "fk_${table}_tenant_parent"`,
        );
      await q.sequelize.query(
        'ALTER TABLE document_versions DROP CONSTRAINT IF EXISTS ck_document_versions_immutable_status',
      );
    }
    await q.bulkDelete('permissions', { name: permissions });
    for (const table of [...tables].reverse()) await q.dropTable(table);
  },
};
