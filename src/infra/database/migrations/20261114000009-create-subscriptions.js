'use strict';
const { randomUUID } = require('crypto');
const tables = [
  'subscription_plans',
  'subscription_plan_versions',
  'subscription_plan_prices',
  'subscription_features',
  'subscription_plan_features',
  'subscription_plan_limits',
  'tenant_subscriptions',
  'subscription_periods',
  'subscription_trials',
  'subscription_entitlements',
  'subscription_overrides',
  'subscription_change_requests',
  'subscription_usage_accounts',
  'subscription_usage_reservations',
  'subscription_usage_records',
  'subscription_transitions',
  'subscription_approvals',
  'subscription_notifications',
  'subscription_policies',
  'subscription_outbox',
];
const globalTables = [
  'subscription_plans',
  'subscription_plan_versions',
  'subscription_plan_prices',
  'subscription_features',
  'subscription_plan_features',
  'subscription_plan_limits',
  'subscription_policies',
  'subscription_outbox',
];
const uniqueTables = tables.filter(
  (t) =>
    !['subscription_transitions', 'subscription_approvals', 'subscription_notifications'].includes(
      t,
    ),
);
const permissions = [
  'subscriptions:read',
  'subscriptions:plans:read',
  'subscriptions:plans:create',
  'subscriptions:plans:update',
  'subscriptions:plans:publish',
  'subscriptions:plans:archive',
  'subscriptions:tenant:read',
  'subscriptions:tenant:create',
  'subscriptions:tenant:cancel',
  'subscriptions:tenant:reactivate',
  'subscriptions:changes:create',
  'subscriptions:changes:read',
  'subscriptions:changes:approve',
  'subscriptions:changes:reject',
  'subscriptions:usage:read',
  'subscriptions:limits:read',
  'subscriptions:entitlements:read',
  'subscriptions:trials:manage',
  'subscriptions:overrides:manage',
  'subscriptions:suspend',
  'subscriptions:reactivate',
  'subscriptions:reports:read',
  'subscriptions:history:read',
  'subscriptions:policies:manage',
];
const features = [
  ['employees', 'Gestão de trabalhadores'],
  ['payroll', 'Processamento salarial'],
  ['documents', 'Gestão documental'],
  ['reports', 'Relatórios avançados'],
  ['simulations', 'Simulações salariais'],
  ['ai-assistant', 'Assistente inteligente'],
  ['organization', 'Estrutura organizacional'],
  ['notifications', 'Notificações'],
  ['support', 'Suporte prioritário'],
];
module.exports = {
  async up(q, S) {
    for (const table of tables) {
      const global = globalTables.includes(table);
      await q.createTable(table, {
        id: { type: S.UUID, primaryKey: true, allowNull: false },
        companyId: {
          type: S.INTEGER.UNSIGNED,
          allowNull: global,
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
      if (uniqueTables.includes(table))
        await q.addIndex(table, global ? ['key'] : ['companyId', 'key'], {
          unique: true,
          name: `uq_${table}_key`,
        });
      if (q.sequelize.getDialect() === 'mysql') {
        const globalParentByTable = {
          subscription_plan_versions: 'subscription_plans',
          subscription_plan_prices: 'subscription_plan_versions',
          subscription_plan_features: 'subscription_plan_versions',
          subscription_plan_limits: 'subscription_plan_versions',
        };
        const globalParent = globalParentByTable[table];
        if (globalParent)
          await q.addConstraint(table, {
            fields: ['runId'],
            type: 'foreign key',
            name: `fk_${table}_parent`,
            references: { table: globalParent, fields: ['id'] },
            onDelete: 'RESTRICT',
          });
        const tenantParentByTable = {
          subscription_periods: 'tenant_subscriptions',
          subscription_trials: 'tenant_subscriptions',
          subscription_entitlements: 'tenant_subscriptions',
          subscription_overrides: 'tenant_subscriptions',
          subscription_change_requests: 'tenant_subscriptions',
          subscription_usage_accounts: 'tenant_subscriptions',
          subscription_transitions: 'tenant_subscriptions',
          subscription_notifications: 'tenant_subscriptions',
          subscription_usage_reservations: 'subscription_usage_accounts',
          subscription_usage_records: 'subscription_usage_accounts',
          subscription_approvals: 'subscription_change_requests',
        };
        const tenantParent = tenantParentByTable[table];
        if (tenantParent)
          await q.addConstraint(table, {
            fields: ['companyId', 'runId'],
            type: 'foreign key',
            name: `fk_${table}_tenant_parent`,
            references: { table: tenantParent, fields: ['companyId', 'id'] },
            onDelete: 'RESTRICT',
          });
      }
      if (q.sequelize.getDialect() === 'postgres') {
        await q.sequelize.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
        await q.sequelize.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
        const predicate = global
          ? `("companyId" IS NULL OR "companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)`
          : `("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)`;
        await q.sequelize.query(
          `CREATE POLICY "${table}_tenant" ON "${table}" USING ${predicate} WITH CHECK ${predicate}`,
        );
      }
    }
    if (q.sequelize.getDialect() === 'postgres') {
      await q.sequelize.query(
        "CREATE UNIQUE INDEX uq_tenant_subscriptions_one_current ON tenant_subscriptions(\"companyId\") WHERE status IN ('PENDING_PAYMENT','TRIALING','ACTIVE','GRACE_PERIOD','SUSPENDED')",
      );
      for (const [table, parent] of [
        ['subscription_plan_versions', 'subscription_plans'],
        ['subscription_plan_prices', 'subscription_plan_versions'],
        ['subscription_plan_features', 'subscription_plan_versions'],
        ['subscription_plan_limits', 'subscription_plan_versions'],
      ])
        await q.sequelize.query(
          `ALTER TABLE "${table}" ADD CONSTRAINT "fk_${table}_parent" FOREIGN KEY ("runId") REFERENCES "${parent}"("id") ON DELETE RESTRICT`,
        );
      for (const [table, parent] of [
        ['subscription_periods', 'tenant_subscriptions'],
        ['subscription_trials', 'tenant_subscriptions'],
        ['subscription_entitlements', 'tenant_subscriptions'],
        ['subscription_overrides', 'tenant_subscriptions'],
        ['subscription_change_requests', 'tenant_subscriptions'],
        ['subscription_usage_accounts', 'tenant_subscriptions'],
        ['subscription_transitions', 'tenant_subscriptions'],
        ['subscription_notifications', 'tenant_subscriptions'],
        ['subscription_usage_reservations', 'subscription_usage_accounts'],
        ['subscription_usage_records', 'subscription_usage_accounts'],
        ['subscription_approvals', 'subscription_change_requests'],
      ])
        await q.sequelize.query(
          `ALTER TABLE "${table}" ADD CONSTRAINT "fk_${table}_tenant_parent" FOREIGN KEY ("companyId","runId") REFERENCES "${parent}"("companyId","id") ON DELETE RESTRICT`,
        );
      await q.sequelize.query(
        `CREATE FUNCTION prevent_published_subscription_plan_change() RETURNS trigger AS $$ BEGIN IF OLD.status = 'PUBLISHED' THEN RAISE EXCEPTION 'Published subscription plan versions are immutable'; END IF; IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`,
      );
      await q.sequelize.query(
        `CREATE TRIGGER subscription_plan_version_immutable BEFORE UPDATE OR DELETE ON subscription_plan_versions FOR EACH ROW EXECUTE FUNCTION prevent_published_subscription_plan_change()`,
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
    const featureKeyColumn = q.queryGenerator.quoteIdentifier('key');
    const [oldFeatures] = await q.sequelize.query(
      `SELECT ${featureKeyColumn} AS featureKey FROM subscription_features`,
    );
    const featureKeys = new Set(oldFeatures.map((row) => row.featureKey));
    const featureRows = features
      .filter(([code]) => !featureKeys.has(code))
      .map(([code, name]) => ({
        id: randomUUID(),
        companyId: null,
        status: 'ACTIVE',
        runId: null,
        employeeId: null,
        key: code,
        version: 1,
        data: JSON.stringify({ code, name, description: null, system: true }),
        createdAt: now,
        updatedAt: now,
      }));
    if (featureRows.length) await q.bulkInsert('subscription_features', featureRows);
  },
  async down(q) {
    if (q.sequelize.getDialect() === 'postgres') {
      await q.sequelize.query('DROP INDEX IF EXISTS uq_tenant_subscriptions_one_current');
      await q.sequelize.query(
        'DROP TRIGGER IF EXISTS subscription_plan_version_immutable ON subscription_plan_versions',
      );
      await q.sequelize.query(
        'DROP FUNCTION IF EXISTS prevent_published_subscription_plan_change()',
      );
      for (const table of tables)
        await q.sequelize.query(`DROP POLICY IF EXISTS "${table}_tenant" ON "${table}"`);
      for (const table of [
        'subscription_plan_versions',
        'subscription_plan_prices',
        'subscription_plan_features',
        'subscription_plan_limits',
      ])
        await q.sequelize.query(
          `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "fk_${table}_parent"`,
        );
      for (const table of [
        'subscription_periods',
        'subscription_trials',
        'subscription_entitlements',
        'subscription_overrides',
        'subscription_change_requests',
        'subscription_usage_accounts',
        'subscription_transitions',
        'subscription_notifications',
        'subscription_usage_reservations',
        'subscription_usage_records',
        'subscription_approvals',
      ])
        await q.sequelize.query(
          `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "fk_${table}_tenant_parent"`,
        );
    }
    await q.bulkDelete('permissions', { name: permissions });
    for (const table of [...tables].reverse()) await q.dropTable(table);
  },
};
