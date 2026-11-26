'use strict';
const tables = [
  'payroll_periods',
  'payroll_runs',
  'payroll_employee_results',
  'payroll_input_snapshots',
  'payroll_outbox',
];
module.exports = {
  async up(q, S) {
    const identity = () => ({
      id: { type: S.UUID, primaryKey: true, allowNull: false },
      companyId: {
        type: S.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
      },
      createdAt: { type: S.DATE, allowNull: false },
    });
    const updated = { type: S.DATE, allowNull: false };
    const text = (length) => ({ type: S.STRING(length), allowNull: false });
    const uuid = () => ({ type: S.UUID, allowNull: false });
    const number = () => ({ type: S.INTEGER, allowNull: false });
    const money = () => ({ type: S.DECIMAL(18, 2), allowNull: false });
    const json = () => ({ type: S.JSON, allowNull: false });
    await q.createTable('payroll_periods', {
      ...identity(),
      startDate: { type: S.DATEONLY, allowNull: false },
      endDate: { type: S.DATEONLY, allowNull: false },
      paymentDate: { type: S.DATEONLY, allowNull: false },
      status: text(30),
      version: number(),
      createdBy: number(),
      updatedAt: updated,
    });
    await q.createTable('payroll_runs', {
      ...identity(),
      periodId: uuid(),
      runType: text(30),
      executionScope: text(30),
      employeeIds: json(),
      status: text(30),
      version: number(),
      createdBy: number(),
      idempotencyKey: text(100),
      requestHash: text(64),
      updatedAt: updated,
    });
    await q.createTable('payroll_employee_results', {
      ...identity(),
      runId: uuid(),
      employeeId: uuid(),
      grossAmount: money(),
      deductionsAmount: money(),
      netAmount: money(),
      employerCostsAmount: money(),
      currency: text(3),
      calculationSnapshot: json(),
      updatedAt: updated,
    });
    await q.createTable('payroll_input_snapshots', {
      ...identity(),
      runId: uuid(),
      employeeId: uuid(),
      inputHash: text(64),
      snapshotData: json(),
    });
    await q.createTable('payroll_outbox', {
      ...identity(),
      aggregateId: uuid(),
      eventType: text(100),
      payload: json(),
      publishedAt: { type: S.DATE, allowNull: true },
    });
    for (const table of tables)
      await q.addIndex(table, ['companyId', 'id'], { unique: true, name: `uq_${table}_tenant` });
    await q.addIndex('payroll_periods', ['companyId', 'startDate', 'endDate']);
    await q.addIndex('payroll_runs', ['companyId', 'periodId', 'status']);
    await q.addIndex('payroll_runs', ['companyId', 'idempotencyKey'], { unique: true });
    for (const table of ['payroll_employee_results', 'payroll_input_snapshots'])
      await q.addIndex(table, ['companyId', 'runId', 'employeeId'], { unique: true });
    if (q.sequelize.getDialect() === 'mysql') {
      for (const [source, field, target, name] of [
        ['payroll_runs', 'periodId', 'payroll_periods', 'fk_payroll_runs_period_tenant'],
        ['payroll_employee_results', 'runId', 'payroll_runs', 'fk_payroll_results_run_tenant'],
        ['payroll_input_snapshots', 'runId', 'payroll_runs', 'fk_payroll_snapshots_run_tenant'],
        ['payroll_employee_results', 'employeeId', 'employees', 'fk_payroll_results_employee_tenant'],
        ['payroll_input_snapshots', 'employeeId', 'employees', 'fk_payroll_snapshots_employee_tenant'],
      ]) {
        await q.addConstraint(source, {
          fields: ['companyId', field],
          type: 'foreign key',
          name,
          references: { table: target, fields: ['companyId', 'id'] },
          onDelete: 'RESTRICT',
        });
      }
    }
    if (q.sequelize.getDialect() === 'postgres') {
      for (const [source, field, target] of [
        ['payroll_runs', 'periodId', 'payroll_periods'],
        ['payroll_employee_results', 'runId', 'payroll_runs'],
        ['payroll_input_snapshots', 'runId', 'payroll_runs'],
        ['payroll_employee_results', 'employeeId', 'employees'],
        ['payroll_input_snapshots', 'employeeId', 'employees'],
      ]) {
        await q.sequelize.query(
          `ALTER TABLE "${source}" ADD FOREIGN KEY ("companyId", "${field}") REFERENCES "${target}" ("companyId", "id") ON DELETE RESTRICT`,
        );
      }
      await q.sequelize.query(`ALTER TABLE payroll_periods ADD CHECK ("startDate" <= "endDate")`);
      await q.sequelize.query(
        `ALTER TABLE payroll_employee_results ADD CHECK ("grossAmount" >= 0 AND "deductionsAmount" >= 0 AND "netAmount" >= 0 AND "employerCostsAmount" >= 0 AND "netAmount" = "grossAmount" - "deductionsAmount")`,
      );
      await q.sequelize.query(
        `CREATE FUNCTION prevent_payroll_input_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Payroll input snapshots are immutable'; END; $$ LANGUAGE plpgsql`,
      );
      await q.sequelize.query(
        `CREATE TRIGGER payroll_input_immutable BEFORE UPDATE OR DELETE ON payroll_input_snapshots FOR EACH ROW EXECUTE FUNCTION prevent_payroll_input_mutation()`,
      );
      for (const table of tables) {
        await q.sequelize.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
        await q.sequelize.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
        await q.sequelize.query(
          `CREATE POLICY "${table}_tenant" ON "${table}" USING ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer) WITH CHECK ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)`,
        );
      }
    }
  },
  async down(q) {
    for (const table of [...tables].reverse()) await q.dropTable(table);
    if (q.sequelize.getDialect() === 'postgres')
      await q.sequelize.query('DROP FUNCTION IF EXISTS prevent_payroll_input_mutation()');
  },
};
