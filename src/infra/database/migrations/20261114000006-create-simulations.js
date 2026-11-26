'use strict';
const tables = [
  'simulation_scenarios',
  'simulation_scenario_versions',
  'simulation_runs',
  'simulation_run_items',
  'simulation_comparisons',
  'simulation_proposals',
  'simulation_approvals',
  'simulation_projections',
  'simulation_exports',
  'simulation_issues',
  'simulation_policies',
  'simulation_outbox',
];
const immutable = ['simulation_scenario_versions', 'simulation_run_items', 'simulation_approvals'];
const unique = [
  'simulation_scenarios',
  'simulation_scenario_versions',
  'simulation_runs',
  'simulation_run_items',
  'simulation_comparisons',
  'simulation_proposals',
  'simulation_approvals',
  'simulation_projections',
  'simulation_exports',
  'simulation_policies',
];
const permissions = [
  'simulations:read',
  'simulations:scenarios:create',
  'simulations:scenarios:update',
  'simulations:scenarios:duplicate',
  'simulations:scenarios:archive',
  'simulations:runs:execute',
  'simulations:runs:read',
  'simulations:runs:retry',
  'simulations:runs:cancel',
  'simulations:individual:execute',
  'simulations:bulk:execute',
  'simulations:salary:read-sensitive',
  'simulations:legal-rules:compare',
  'simulations:projections:read',
  'simulations:comparisons:create',
  'simulations:proposals:create',
  'simulations:proposals:read',
  'simulations:proposals:approve',
  'simulations:proposals:reject',
  'simulations:exports:create',
  'simulations:exports:download',
  'simulations:history:read',
  'simulations:policies:manage',
];
module.exports = {
  async up(q, S) {
    for (const table of tables) {
      await q.createTable(table, {
        id: { type: S.UUID, primaryKey: true, allowNull: false },
        companyId: {
          type: S.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'companies', key: 'id' },
          onDelete: 'RESTRICT',
        },
        status: { type: S.STRING(40), allowNull: false },
        runId: { type: S.UUID, allowNull: true },
        employeeId: { type: S.UUID, allowNull: true },
        key: { type: S.STRING(200), allowNull: false },
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
      if (q.sequelize.getDialect() === 'mysql') {
        const parentByTable = {
          simulation_scenario_versions: 'simulation_scenarios',
          simulation_runs: 'simulation_scenarios',
          simulation_run_items: 'simulation_runs',
          simulation_comparisons: 'simulation_runs',
          simulation_proposals: 'simulation_runs',
          simulation_approvals: 'simulation_proposals',
          simulation_projections: 'simulation_runs',
          simulation_exports: 'simulation_runs',
          simulation_issues: 'simulation_runs',
        };
        const parent = parentByTable[table];
        if (parent)
          await q.addConstraint(table, {
            fields: ['companyId', 'runId'],
            type: 'foreign key',
            name: `fk_${table}_tenant_parent`,
            references: { table: parent, fields: ['companyId', 'id'] },
            onDelete: 'RESTRICT',
          });
      }
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
        ['simulation_scenario_versions', 'simulation_scenarios'],
        ['simulation_runs', 'simulation_scenarios'],
        ['simulation_run_items', 'simulation_runs'],
        ['simulation_comparisons', 'simulation_runs'],
        ['simulation_proposals', 'simulation_runs'],
        ['simulation_approvals', 'simulation_proposals'],
        ['simulation_projections', 'simulation_runs'],
        ['simulation_exports', 'simulation_runs'],
        ['simulation_issues', 'simulation_runs'],
      ]) {
        await q.sequelize.query(
          `ALTER TABLE "${table}" ADD CONSTRAINT "fk_${table}_tenant_parent" FOREIGN KEY ("companyId","runId") REFERENCES "${parent}" ("companyId","id") ON DELETE RESTRICT`,
        );
      }
      await q.sequelize.query(
        `CREATE FUNCTION prevent_simulation_evidence_change() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Simulation snapshots, results and decisions are immutable'; END; $$ LANGUAGE plpgsql`,
      );
      for (const table of immutable)
        await q.sequelize.query(
          `CREATE TRIGGER "${table}_immutable" BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION prevent_simulation_evidence_change()`,
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
      for (const table of immutable)
        await q.sequelize.query(`DROP TRIGGER IF EXISTS "${table}_immutable" ON "${table}"`);
      for (const table of tables)
        await q.sequelize.query(`DROP POLICY IF EXISTS "${table}_tenant" ON "${table}"`);
      for (const table of [
        'simulation_scenario_versions',
        'simulation_runs',
        'simulation_run_items',
        'simulation_comparisons',
        'simulation_proposals',
        'simulation_approvals',
        'simulation_projections',
        'simulation_exports',
        'simulation_issues',
      ])
        await q.sequelize.query(
          `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "fk_${table}_tenant_parent"`,
        );
      await q.sequelize.query('DROP FUNCTION IF EXISTS prevent_simulation_evidence_change()');
    }
    await q.bulkDelete('permissions', { name: permissions });
    for (const table of [...tables].reverse()) await q.dropTable(table);
  },
};
