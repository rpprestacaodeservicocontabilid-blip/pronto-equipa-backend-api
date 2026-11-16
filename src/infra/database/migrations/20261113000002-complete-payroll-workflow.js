'use strict';
const tables = [
  'payroll_batches',
  'payroll_batch_items',
  'payroll_validation_issues',
  'payroll_approvals',
  'payroll_closings',
  'payroll_adjustments',
  'payroll_payment_instructions',
  'payroll_policies',
  'payroll_result_lines',
  'payroll_calculation_snapshots',
  'payroll_exports',
];
const immutable = ['payroll_closings', 'payroll_approvals', 'payroll_calculation_snapshots'];
module.exports = {
  async up(q, S) {
    await q.addColumn('payroll_runs', 'originalRunId', { type: S.UUID, allowNull: true });
    await q.addColumn('payroll_runs', 'reason', { type: S.STRING(1000), allowNull: true });
    for (const table of tables) {
      await q.createTable(table, {
        id: { type: S.UUID, primaryKey: true, allowNull: false },
        companyId: {
          type: S.INTEGER,
          allowNull: false,
          references: { model: 'companies', key: 'id' },
        },
        runId: { type: S.UUID, allowNull: true },
        employeeId: { type: S.UUID, allowNull: true },
        status: { type: S.STRING(40), allowNull: false },
        version: { type: S.INTEGER, allowNull: false },
        key: { type: S.STRING(200), allowNull: false },
        data: { type: S.JSON, allowNull: false },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false },
      });
      await q.addIndex(table, ['companyId', 'key'], { unique: true });
      await q.addIndex(table, ['companyId', 'runId', 'status']);
      if (q.sequelize.getDialect() === 'postgres') {
        await q.sequelize.query(
          `ALTER TABLE "${table}" ADD FOREIGN KEY ("companyId", "runId") REFERENCES payroll_runs ("companyId", id) ON DELETE RESTRICT`,
        );
        await q.sequelize.query(
          `ALTER TABLE "${table}" ADD FOREIGN KEY ("companyId", "employeeId") REFERENCES employees ("companyId", id) ON DELETE RESTRICT`,
        );
        await q.sequelize.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
        await q.sequelize.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
        await q.sequelize.query(
          `CREATE POLICY "${table}_tenant" ON "${table}" USING ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer) WITH CHECK ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)`,
        );
      }
    }
    if (q.sequelize.getDialect() === 'postgres') {
      await q.sequelize.query(
        'ALTER TABLE payroll_runs ADD CONSTRAINT fk_payroll_original_run FOREIGN KEY ("companyId", "originalRunId") REFERENCES payroll_runs ("companyId", id)',
      );
      await q.sequelize.query(
        `CREATE FUNCTION payroll_immutable_evidence() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Payroll evidence is immutable'; END; $$ LANGUAGE plpgsql`,
      );
      for (const table of immutable)
        await q.sequelize.query(
          `CREATE TRIGGER "${table}_immutable" BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION payroll_immutable_evidence()`,
        );
      await q.sequelize.query(
        `CREATE FUNCTION payroll_protect_closed_run() RETURNS trigger AS $$ BEGIN IF OLD.status = 'CLOSED' THEN RAISE EXCEPTION 'Closed payroll is immutable'; END IF; IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`,
      );
      await q.sequelize.query(
        `CREATE TRIGGER payroll_closed_run BEFORE UPDATE OR DELETE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION payroll_protect_closed_run()`,
      );
      await q.sequelize.query(
        `CREATE FUNCTION payroll_protect_closed_result() RETURNS trigger AS $$ BEGIN
         IF TG_OP <> 'INSERT' THEN
           IF EXISTS (SELECT 1 FROM payroll_runs WHERE id = OLD."runId" AND "companyId" = OLD."companyId" AND status = 'CLOSED') THEN RAISE EXCEPTION 'Closed payroll results are immutable'; END IF;
         END IF;
         IF TG_OP <> 'DELETE' THEN
           IF EXISTS (SELECT 1 FROM payroll_runs WHERE id = NEW."runId" AND "companyId" = NEW."companyId" AND status = 'CLOSED') THEN RAISE EXCEPTION 'Closed payroll results are immutable'; END IF;
           RETURN NEW;
         END IF; RETURN OLD; END; $$ LANGUAGE plpgsql`,
      );
      for (const table of [
        'payroll_employee_results',
        'payroll_result_lines',
        'payroll_adjustments',
      ])
        await q.sequelize.query(
          `CREATE TRIGGER "${table}_closed" BEFORE INSERT OR UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION payroll_protect_closed_result()`,
        );
    }
  },
  async down(q) {
    if (q.sequelize.getDialect() === 'postgres') {
      await q.sequelize.query('DROP TRIGGER IF EXISTS payroll_closed_run ON payroll_runs');
      await q.sequelize.query(
        'DROP TRIGGER IF EXISTS payroll_employee_results_closed ON payroll_employee_results',
      );
      await q.sequelize.query(
        'ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS fk_payroll_original_run',
      );
    }
    for (const table of [...tables].reverse()) await q.dropTable(table);
    if (q.sequelize.getDialect() === 'postgres')
      for (const name of [
        'payroll_immutable_evidence',
        'payroll_protect_closed_run',
        'payroll_protect_closed_result',
      ])
        await q.sequelize.query(`DROP FUNCTION IF EXISTS ${name}()`);
    // SQLite rebuilds tables for DROP COLUMN. Sequelize incorrectly turns
    // multi-column unique indexes into per-column uniqueness during that
    // rebuild. Remove explicit indexes first, then restore their exact scope.
    const indexes =
      q.sequelize.getDialect() === 'sqlite'
        ? (await q.showIndex('payroll_runs')).filter(
            (index) => !index.primary && !index.name.startsWith('sqlite_autoindex'),
          )
        : [];
    for (const index of indexes) await q.removeIndex('payroll_runs', index.name);
    await q.removeColumn('payroll_runs', 'reason');
    await q.removeColumn('payroll_runs', 'originalRunId');
    for (const index of indexes)
      await q.addIndex(
        'payroll_runs',
        index.fields.map((field) => field.attribute),
        { name: index.name, unique: index.unique },
      );
  },
};
