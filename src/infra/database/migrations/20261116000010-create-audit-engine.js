'use strict';
const objectTables = [
  'audit_investigations',
  'audit_evidence_packages',
  'audit_export_requests',
  'audit_policies',
  'audit_retention_policies',
  'audit_retention_executions',
  'audit_legal_holds',
  'audit_alert_rules',
  'audit_alerts',
  'audit_integrity_checkpoints',
  'audit_integrity_verifications',
  'audit_ingestion_failures',
  'audit_reconciliation_runs',
  'audit_source_cursors',
  'audit_outbox',
];
const captures = [
  'companies',
  'company_members',
  'roles',
  'role_permissions',
  'employment_contracts',
  'employee_salary_assignments',
  'payroll_runs',
  'payroll_employee_results',
  'payroll_payment_batches',
  'payroll_payment_approvals',
  'payroll_payment_transactions',
  'payment_instructions',
  'legal_rule_sets',
  'platform_billing_records',
];
const fields = [
  'id',
  'companyId',
  'status',
  'version',
  'periodId',
  'runId',
  'employeeId',
  'roleId',
  'permissionId',
  'approvedBy',
  'actorUserId',
  'amount',
  'currency',
  'grossAmount',
  'netAmount',
  'eventType',
  'kind',
];
async function installCapture(q) {
  const dialect = q.sequelize.getDialect(),
    quote = (s) => q.queryGenerator.quoteIdentifier(s);
  if (!['postgres', 'sqlite'].includes(dialect))
    throw new Error('Audit capture requires PostgreSQL (SQLite only for tests).');
  for (const table of captures) {
    if (!(await q.tableExists(table))) continue;
    const columns = await q.describeTable(table);
    if (!columns.id && !(columns.roleId && columns.permissionId)) continue;
    const keys = fields.filter((key) => columns[key]);
    const projection = (alias) =>
      keys.flatMap((key) => ["'" + key + "'", alias + '.' + quote(key)]).join(',');
    const company = (alias) =>
      columns.companyId
        ? alias + '.' + quote('companyId')
        : table === 'companies'
          ? alias + '.id'
          : table === 'role_permissions'
            ? '(SELECT ' +
              quote('companyId') +
              ' FROM audit_role_scopes WHERE ' +
              quote('roleId') +
              '=' +
              alias +
              '.' +
              quote('roleId') +
              ')'
            : 'NULL';
    const resource = (alias) =>
      columns.id
        ? 'CAST(' + alias + '.id AS TEXT)'
        : 'CAST(' +
          alias +
          '.' +
          quote('roleId') +
          " AS TEXT)||':'||CAST(" +
          alias +
          '.' +
          quote('permissionId') +
          ' AS TEXT)';
    const catalog = (expression) =>
      'INSERT INTO audit_scope_catalog (' +
      quote('scopeKey') +
      ',' +
      quote('companyId') +
      ') VALUES (CASE WHEN ' +
      expression +
      " IS NULL THEN 'platform' ELSE 'tenant:'||CAST(" +
      expression +
      ' AS TEXT) END,' +
      expression +
      ') ON CONFLICT (' +
      quote('scopeKey') +
      ') DO NOTHING;';
    if (dialect === 'postgres') {
      const name = 'audit_capture_' + table;
      const roleMap =
        table === 'roles'
          ? 'INSERT INTO audit_role_scopes (' +
            quote('roleId') +
            ',' +
            quote('companyId') +
            ") VALUES (CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END,CASE WHEN TG_OP='DELETE' THEN OLD." +
            quote('companyId') +
            ' ELSE NEW.' +
            quote('companyId') +
            ' END) ON CONFLICT (' +
            quote('roleId') +
            ') DO UPDATE SET ' +
            quote('companyId') +
            '=EXCLUDED.' +
            quote('companyId') +
            ';'
          : '';
      const tenant =
        "CASE WHEN TG_OP='DELETE' THEN " + company('OLD') + ' ELSE ' + company('NEW') + ' END';
      await q.sequelize.query(
        'CREATE OR REPLACE FUNCTION ' +
          quote(name) +
          '() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN ' +
          roleMap +
          catalog(tenant) +
          ' INSERT INTO audit_capture_events (id,' +
          quote('companyId') +
          ',' +
          quote('sourceId') +
          ',' +
          quote('eventType') +
          ',' +
          quote('resourceType') +
          ',' +
          quote('resourceId') +
          ',' +
          quote('actorId') +
          ',' +
          quote('correlationId') +
          ',' +
          quote('occurredAt') +
          ',payload) VALUES (gen_random_uuid(),' +
          tenant +
          ",'database','database.'||TG_TABLE_NAME||'.'||lower(TG_OP),TG_TABLE_NAME,CASE WHEN TG_OP='DELETE' THEN " +
          resource('OLD') +
          ' ELSE ' +
          resource('NEW') +
          " END,NULLIF(current_setting('app.audit_actor',true),''),NULLIF(current_setting('app.audit_correlation',true),''),clock_timestamp(),jsonb_build_object('operation',TG_OP,'before',CASE WHEN TG_OP='INSERT' THEN NULL ELSE jsonb_build_object(" +
          projection('OLD') +
          ") END,'after',CASE WHEN TG_OP='DELETE' THEN NULL ELSE jsonb_build_object(" +
          projection('NEW') +
          ") END)); IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; $$;",
      );
      await q.sequelize.query(
        'DROP TRIGGER IF EXISTS ' +
          quote(name) +
          ' ON ' +
          quote(table) +
          '; CREATE TRIGGER ' +
          quote(name) +
          ' AFTER INSERT OR UPDATE OR DELETE ON ' +
          quote(table) +
          ' FOR EACH ROW EXECUTE FUNCTION ' +
          quote(name) +
          '();',
      );
    } else
      for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
        const name = 'audit_capture_' + table + '_' + operation.toLowerCase(),
          ref = operation === 'DELETE' ? 'OLD' : 'NEW';
        const roleMap =
          table === 'roles'
            ? 'INSERT INTO audit_role_scopes (' +
              quote('roleId') +
              ',' +
              quote('companyId') +
              ') VALUES (' +
              ref +
              '.id,' +
              ref +
              '.' +
              quote('companyId') +
              ') ON CONFLICT (' +
              quote('roleId') +
              ') DO UPDATE SET ' +
              quote('companyId') +
              '=excluded.' +
              quote('companyId') +
              ';'
            : '';
        await q.sequelize.query('DROP TRIGGER IF EXISTS ' + quote(name));
        const uuid =
          "lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))";
        await q.sequelize.query(
          'CREATE TRIGGER ' +
            quote(name) +
            ' AFTER ' +
            operation +
            ' ON ' +
            quote(table) +
            ' BEGIN ' +
            roleMap +
            catalog(company(ref)) +
            ' INSERT INTO audit_capture_events (id,companyId,sourceId,eventType,resourceType,resourceId,actorId,correlationId,occurredAt,payload) VALUES (' +
            uuid +
            ',' +
            company(ref) +
            ",'database','database." +
            table +
            '.' +
            operation.toLowerCase() +
            "','" +
            table +
            "'," +
            resource(ref) +
            ",NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),json_object('operation','" +
            operation +
            "','before'," +
            (operation === 'INSERT' ? 'NULL' : 'json_object(' + projection('OLD') + ')') +
            ",'after'," +
            (operation === 'DELETE' ? 'NULL' : 'json_object(' + projection('NEW') + ')') +
            ')); END;',
        );
      }
  }
}
module.exports = {
  async up(q, S) {
    const string = (n = 200) => ({ type: S.STRING(n), allowNull: false }),
      nullable = (n = 200) => ({ type: S.STRING(n), allowNull: true });
    const scope = { scopeKey: string(), companyId: { type: S.INTEGER, allowNull: true } };
    const record = {
      id: { type: S.UUID, primaryKey: true, allowNull: false },
      ...scope,
      eventId: string(),
      sourceId: string(),
      sequence: { type: S.BIGINT, allowNull: false },
      schemaVersion: { type: S.INTEGER, allowNull: false },
      eventType: string(),
      category: string(40),
      severity: string(20),
      outcome: string(20),
      actorId: nullable(),
      resourceType: string(),
      resourceId: string(),
      correlationId: nullable(),
      sensitivity: string(20),
      occurredAt: { type: S.DATE, allowNull: false },
      receivedAt: { type: S.DATE, allowNull: false },
      policyVersion: { type: S.INTEGER, allowNull: false },
      inputHash: string(64),
      previousHash: string(64),
      payloadHash: string(64),
      recordHash: string(64),
      payload: { type: S.JSON, allowNull: false },
    };
    await q.createTable('audit_records', record);
    await q.addIndex('audit_records', ['scopeKey', 'sourceId', 'eventId'], { unique: true });
    await q.addIndex('audit_records', ['scopeKey', 'sequence'], { unique: true });
    for (const index of [
      ['companyId', 'occurredAt'],
      ['scopeKey', 'actorId', 'sequence'],
      ['scopeKey', 'resourceType', 'resourceId'],
      ['scopeKey', 'correlationId'],
      ['scopeKey', 'category', 'outcome'],
    ])
      await q.addIndex('audit_records', index);
    await q.createTable('audit_scope_catalog', {
      ...scope,
      scopeKey: { ...string(), primaryKey: true },
    });
    await q.createTable('audit_chain_heads', {
      ...scope,
      scopeKey: { ...string(), primaryKey: true },
      sequence: { type: S.BIGINT, allowNull: false },
      recordHash: string(64),
    });
    await q.createTable('audit_capture_events', {
      id: { type: S.UUID, primaryKey: true, allowNull: false },
      companyId: { type: S.INTEGER, allowNull: true },
      sourceId: string(),
      eventType: string(),
      resourceType: string(),
      resourceId: string(),
      actorId: nullable(),
      correlationId: nullable(),
      occurredAt: { type: S.DATE, allowNull: false },
      payload: { type: S.JSON, allowNull: false },
      processedAt: { type: S.DATE, allowNull: true },
    });
    await q.addIndex('audit_capture_events', ['companyId', 'processedAt', 'occurredAt', 'id']);
    await q.createTable('audit_role_scopes', {
      roleId: { type: S.INTEGER, primaryKey: true },
      companyId: { type: S.INTEGER, allowNull: true },
    });
    for (const table of objectTables) {
      await q.createTable(table, {
        id: { type: S.UUID, primaryKey: true, allowNull: false },
        ...scope,
        kind: string(40),
        key: string(240),
        status: string(40),
        data: { type: S.JSON, allowNull: false },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false },
      });
      await q.addIndex(table, ['scopeKey', 'key'], { unique: true });
      await q.addIndex(table, ['companyId', 'status', 'createdAt']);
    }
    if (await q.tableExists('roles')) {
      const quote = (s) => q.queryGenerator.quoteIdentifier(s);
      await q.sequelize.query(
        `INSERT INTO audit_role_scopes (${quote('roleId')},${quote('companyId')}) SELECT id,${quote('companyId')} FROM roles`,
      );
    }
    await installCapture(q, S);
    if (q.sequelize.getDialect() === 'postgres') {
      for (const table of ['audit_records', 'audit_chain_heads', ...objectTables]) {
        await q.sequelize.query(
          `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY; ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY; CREATE POLICY "${table}_tenant" ON "${table}" USING ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer OR ("companyId" IS NULL AND NULLIF(current_setting('app.current_tenant', true), '') IS NULL)) WITH CHECK ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer OR ("companyId" IS NULL AND NULLIF(current_setting('app.current_tenant', true), '') IS NULL));`,
        );
      }
      await q.sequelize.query(
        `ALTER TABLE audit_capture_events ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_capture_events FORCE ROW LEVEL SECURITY; CREATE POLICY audit_capture_select ON audit_capture_events FOR SELECT USING (\"companyId\" = NULLIF(current_setting('app.current_tenant',true),'')::integer OR (\"companyId\" IS NULL AND NULLIF(current_setting('app.current_tenant',true),'') IS NULL)); CREATE POLICY audit_capture_insert ON audit_capture_events FOR INSERT WITH CHECK (true); CREATE POLICY audit_capture_update ON audit_capture_events FOR UPDATE USING (\"companyId\" = NULLIF(current_setting('app.current_tenant',true),'')::integer OR (\"companyId\" IS NULL AND NULLIF(current_setting('app.current_tenant',true),'') IS NULL));`,
      );
      await q.sequelize.query(
        `CREATE FUNCTION audit_reject_record_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit records are append-only'; END; $$; CREATE TRIGGER audit_record_immutable BEFORE UPDATE OR DELETE ON audit_records FOR EACH ROW EXECUTE FUNCTION audit_reject_record_mutation();`,
      );
    } else if (q.sequelize.getDialect() === 'sqlite')
      for (const op of ['UPDATE', 'DELETE'])
        await q.sequelize.query(
          `CREATE TRIGGER audit_record_immutable_${op.toLowerCase()} BEFORE ${op} ON audit_records BEGIN SELECT RAISE(ABORT,'audit records are append-only'); END;`,
        );
  },
  async down() {
    throw new Error(
      'Audit history is append-only. Rollback requires an explicit, reviewed archival migration.',
    );
  },
  installCapture,
};
