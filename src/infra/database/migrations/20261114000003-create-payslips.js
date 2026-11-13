'use strict';

const tables = [
  'payslips', 'payslip_batches', 'payslip_batch_items', 'payslip_templates',
  'payslip_template_versions', 'payslip_documents', 'payslip_publications',
  'payslip_deliveries', 'payslip_corrections', 'payslip_access_logs',
  'payslip_policies', 'payslip_outbox', 'employee_user_links',
];

module.exports = {
  async up(q, S) {
    await q.addIndex('employees', ['companyId','id'], { unique:true, name:'uq_employees_company_id' });
    for (const table of tables) {
      await q.createTable(table, {
        id: { type: S.UUID, primaryKey: true, allowNull: false },
        companyId: { type: S.INTEGER, allowNull: false, references: { model: 'companies', key: 'id' }, onDelete: 'RESTRICT' },
        status: { type: S.STRING(40), allowNull: false },
        runId: { type: S.UUID, allowNull: true },
        employeeId: { type: S.UUID, allowNull: true },
        key: { type: S.STRING(200), allowNull: false },
        data: { type: S.JSON, allowNull: false },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false },
      });
      await q.addIndex(table, ['companyId', 'id'], { unique: true, name: `uq_${table}_tenant` });
      await q.addIndex(table, ['companyId', 'runId', 'status'], { name: `idx_${table}_run_status` });
    }
    for (const table of ['payslips','payslip_batches','payslip_batch_items','payslip_templates','payslip_template_versions','payslip_documents','payslip_corrections','payslip_policies','employee_user_links'])
      await q.addIndex(table, ['companyId','key'], { unique: true, name: `uq_${table}_key` });
    await q.addIndex('employee_user_links',['companyId','employeeId'],{unique:true,name:'uq_employee_user_links_employee'});
    await q.addIndex('payslips', ['companyId','employeeId','status'], { name: 'idx_payslips_employee_status' });
    await q.addIndex('payslip_access_logs', ['companyId','key','createdAt'], { name: 'idx_payslip_access_history' });
    if (q.sequelize.getDialect() === 'postgres') {
      await q.sequelize.query(`ALTER TABLE payslips ADD FOREIGN KEY ("companyId", "runId") REFERENCES payroll_runs ("companyId", "id") ON DELETE RESTRICT`);
      await q.sequelize.query(`ALTER TABLE payslips ADD FOREIGN KEY ("companyId", "employeeId") REFERENCES employees ("companyId", "id") ON DELETE RESTRICT`);
      await q.sequelize.query(`ALTER TABLE payslip_batches ADD FOREIGN KEY ("companyId", "runId") REFERENCES payroll_runs ("companyId", "id") ON DELETE RESTRICT`);
      await q.sequelize.query(`ALTER TABLE payslip_batch_items ADD FOREIGN KEY ("companyId", "runId") REFERENCES payroll_runs ("companyId", "id") ON DELETE RESTRICT`);
      await q.sequelize.query(`ALTER TABLE payslip_batch_items ADD FOREIGN KEY ("companyId", "employeeId") REFERENCES employees ("companyId", "id") ON DELETE RESTRICT`);
      await q.sequelize.query(`ALTER TABLE employee_user_links ADD FOREIGN KEY ("companyId", "employeeId") REFERENCES employees ("companyId", "id") ON DELETE RESTRICT`);
      await q.sequelize.query(`CREATE FUNCTION protect_payslip_snapshot() RETURNS trigger AS $$ BEGIN IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Issued payslips are retained'; END IF; IF OLD.data->'snapshot' IS DISTINCT FROM NEW.data->'snapshot' OR (OLD.data->>'documentHash' IS NOT NULL AND OLD.data->>'documentHash' IS DISTINCT FROM NEW.data->>'documentHash') OR (OLD.data->>'documentStorageKey' IS NOT NULL AND OLD.data->>'documentStorageKey' IS DISTINCT FROM NEW.data->>'documentStorageKey') THEN RAISE EXCEPTION 'Issued payslip snapshots and documents are immutable'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
      await q.sequelize.query(`CREATE TRIGGER payslip_immutable BEFORE UPDATE OR DELETE ON payslips FOR EACH ROW EXECUTE FUNCTION protect_payslip_snapshot()`);
      for (const table of tables) {
        await q.sequelize.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
        await q.sequelize.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
        await q.sequelize.query(`CREATE POLICY "${table}_tenant" ON "${table}" USING ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer) WITH CHECK ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)`);
      }
    }
  },
  async down(q) {
    if (q.sequelize.getDialect() === 'postgres') {
      for (const table of tables) await q.sequelize.query(`DROP POLICY IF EXISTS "${table}_tenant" ON "${table}"`);
      await q.sequelize.query('DROP FUNCTION IF EXISTS protect_payslip_snapshot()');
    }
    for (const table of [...tables].reverse()) await q.dropTable(table);
    await q.removeIndex('employees','uq_employees_company_id').catch(() => undefined);
  },
};
