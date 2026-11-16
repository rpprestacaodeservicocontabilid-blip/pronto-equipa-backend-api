'use strict';
const { randomUUID } = require('crypto');
const tenantPermissions = [
  'audit:records:read-own',
  'audit:records:read-tenant',
  'audit:records:read-sensitive',
  'audit:resources:history',
  'audit:actors:activity',
  'audit:correlations:read',
  'audit:investigations:create',
  'audit:investigations:read',
  'audit:investigations:update',
  'audit:investigations:close',
  'audit:evidence:create',
  'audit:evidence:read',
  'audit:evidence:verify',
  'audit:evidence:download',
  'audit:exports:create',
  'audit:exports:read',
  'audit:exports:approve',
  'audit:exports:reject',
  'audit:exports:download',
  'audit:policies:read',
  'audit:policies:manage',
  'audit:integrity:read',
  'audit:integrity:verify',
  'audit:retention:read',
  'audit:retention:manage',
  'audit:legal-holds:create',
  'audit:legal-holds:read',
  'audit:legal-holds:release',
  'audit:alerts:read',
  'audit:alerts:manage',
  'audit:reports:read',
  'audit:reports:export',
  'audit:administration:read',
  'audit:administration:manage',
];
module.exports = {
  async up(q) {
    const [existing] = await q.sequelize.query('SELECT name FROM permissions');
    const now = new Date();
    const definitions = [
      ...tenantPermissions.map((name) => ({ name, scope: 'TENANT' })),
      { name: 'audit:records:read-platform', scope: 'PLATFORM' },
      ...tenantPermissions
        .filter((n) => n !== 'audit:records:read-own' && n !== 'audit:records:read-tenant')
        .map((n) => ({ name: 'platform:' + n, scope: 'PLATFORM' })),
    ];
    const rows = definitions
      .filter((d) => !existing.some((p) => p.name === d.name))
      .map((d) => ({
        ...d,
        description: d.name,
        resource: d.name.slice(0, d.name.lastIndexOf(':')),
        action: d.name.slice(d.name.lastIndexOf(':') + 1),
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      }));
    if (rows.length) await q.bulkInsert('permissions', rows);
    // Sensitive and approval privileges are deliberately assigned by administrators, never through a blanket ADMIN grant.
    if (await q.tableExists('communication_records')) {
      const [templates] = await q.sequelize.query(
        "SELECT id FROM communication_records WHERE kind='TEMPLATE' AND \"scopeKey\"='platform' AND \"key\"='AUDIT_ALERT:1'",
      );
      if (!templates.length)
        await q.bulkInsert('communication_records', [
          {
            id: randomUUID(),
            companyId: null,
            scopeKey: 'platform',
            kind: 'TEMPLATE',
            key: 'AUDIT_ALERT:1',
            status: 'PUBLISHED',
            userId: null,
            data: {
              code: 'AUDIT_ALERT',
              category: 'SECURITY',
              version: 1,
              mandatory: true,
              subject: 'Alerta de auditoria: {{severity}}',
              body: 'Foi registado o alerta {{alertId}} no âmbito {{scope}}. Consulte a área de auditoria com as suas permissões.',
            },
            createdAt: now,
            updatedAt: now,
          },
        ]);
    }
  },
  async down() {
    throw new Error(
      'Audit permissions and evidence history require an explicit reviewed rollback.',
    );
  },
  tenantPermissions,
};
