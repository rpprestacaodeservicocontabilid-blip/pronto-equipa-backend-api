'use strict';
const { createAuditMonth, secureAuditPartition } = require('../helpers/audit-partitioning.cjs');
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
  'communication_records',
  'users',
  'auth_accounts',
  'auth_sessions',
  'user_roles',
  'user_permissions',
  'employees',
  'employee_bank_accounts',
  'employee_status_history',
  'contract_records',
  'salary_component_versions',
  'employee_salary_components',
  'salary_revisions',
  'salary_revision_batches',
  'payroll_periods',
  'payroll_approvals',
  'payroll_exports',
  'payroll_payment_orders',
  'payroll_payment_provider_configs',
  'payroll_payment_reconciliations',
  'leave_requests',
  'leave_approvals',
  'attendance_records',
  'employee_loans',
  'loan_approvals',
  'loan_repayments',
  'organization_records',
  'documents',
  'document_versions',
  'document_approvals',
  'document_access_grants',
  'document_legal_holds',
  'document_deletion_requests',
  'payslip_documents',
  'payslips',
  'payslip_publications',
  'payslip_corrections',
  'payslip_deliveries',
  'tenant_subscriptions',
  'subscription_change_requests',
  'subscription_approvals',
  'subscription_plan_versions',
  'simulation_scenarios',
  'report_records',
  'onboarding_applications',
  'onboarding_resources',
  'support_records',
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
  'userId',
  'createdBy',
  'updatedBy',
  'ownerId',
  'applicationId',
  'type',
  'action',
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
  if (!['postgres', 'sqlite', 'mysql'].includes(dialect))
    throw new Error('Audit capture supports PostgreSQL, MySQL 8, and SQLite tests.');
  for (const table of captures) {
    if (!(await q.tableExists(table))) continue;
    const columns = await q.describeTable(table);
    if (!columns.id && !(columns.roleId && columns.permissionId)) continue;
    const keys = fields.filter((key) => columns[key]);
    const projection = (alias) => {
      const projected = keys.flatMap((key) => [
        "'" + key + "'",
        /amount|salary|gross/i.test(key) ? "'[REDACTED]'" : alias + '.' + quote(key),
      ]);
      if (columns.data) {
        const links = [
          'subscriptionId',
          'invoiceId',
          'paymentId',
          'receiptId',
          'transactionId',
          'contractId',
          'employeeId',
          'runId',
          'eventId',
          'planId',
          'parentId',
          'requesterId',
          'approverId',
          'providerId',
          'messageId',
        ];
        const values = links.flatMap((key) => [
          "'" + key + "'",
          dialect === 'postgres'
            ? `CASE WHEN jsonb_typeof(${alias}.${quote('data')}::jsonb->'${key}') IN ('string','number') THEN left(${alias}.${quote('data')}::jsonb->>'${key}',200) ELSE NULL END`
            : `CASE WHEN json_type(${alias}.${quote('data')},'$.${key}') IN ('text','integer','real') THEN substr(json_extract(${alias}.${quote('data')},'$.${key}'),1,200) ELSE NULL END`,
        ]);
        projected.push(
          "'links'",
          `${dialect === 'postgres' ? 'jsonb_build_object' : 'json_object'}(${values.join(',')})`,
        );
      }
      return projected.join(',');
    };
    const company = (alias) =>
      columns.companyId
        ? alias + '.' + quote('companyId')
        : table === 'companies'
          ? alias + '.id'
          : ['role_permissions', 'user_roles'].includes(table)
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
    // Audit alert delivery is excluded to prevent a notification/audit feedback loop.
    const notificationCapture = (alias) => {
      if (table !== 'communication_records') return 'TRUE';
      const messageId =
        dialect === 'postgres'
          ? `${alias}.data::jsonb->>'messageId'`
          : `json_extract(${alias}.data,'$.messageId')`;
      return `(${alias}.kind IN ('MESSAGE','DELIVERY') AND ${alias}.${quote('key')} NOT LIKE 'audit-alert:%' AND NOT EXISTS (SELECT 1 FROM communication_records parent WHERE CAST(parent.id AS TEXT)=${messageId} AND parent.${quote('key')} LIKE 'audit-alert:%'))`;
    };
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
          (table === 'communication_records'
            ? `IF TG_OP='DELETE' THEN IF NOT ${notificationCapture('OLD')} THEN RETURN OLD; END IF; ELSE IF NOT ${notificationCapture('NEW')} THEN RETURN NEW; END IF; END IF; `
            : '') +
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
    } else if (dialect === 'mysql') {
      const jsonObject = (alias) => {
        const projected = keys.flatMap((key) => [
          "'" + key + "'",
          /amount|salary|gross/i.test(key) ? "'[REDACTED]'" : alias + '.' + quote(key),
        ]);
        if (columns.data) {
          const links = [
            'subscriptionId', 'invoiceId', 'paymentId', 'receiptId', 'transactionId',
            'contractId', 'employeeId', 'runId', 'eventId', 'planId', 'parentId',
            'requesterId', 'approverId', 'providerId', 'messageId',
          ];
          const linkProjection = links.flatMap((key) => {
            const value = `JSON_EXTRACT(${alias}.${quote('data')},'$.${key}')`;
            return [
              `'${key}'`,
              `CASE WHEN JSON_TYPE(${value}) IN ('STRING','INTEGER','DOUBLE') THEN LEFT(JSON_UNQUOTE(${value}),200) ELSE NULL END`,
            ];
          });
          projected.push("'links'", `JSON_OBJECT(${linkProjection.join(',')})`);
        }
        return `JSON_OBJECT(${projected.join(',')})`;
      };
      const tenant = (alias) => company(alias);
      const resourceId = (alias) => columns.id
        ? `CAST(${alias}.id AS CHAR)`
        : `CONCAT(CAST(${alias}.${quote('roleId')} AS CHAR),':',CAST(${alias}.${quote('permissionId')} AS CHAR))`;
      const notificationGuard = (alias) => table !== 'communication_records'
        ? 'TRUE'
        : `${alias}.kind IN ('MESSAGE','DELIVERY') AND ${alias}.${quote('key')} NOT LIKE 'audit-alert:%' AND NOT EXISTS (SELECT 1 FROM communication_records parent WHERE CAST(parent.id AS CHAR)=JSON_UNQUOTE(JSON_EXTRACT(${alias}.data,'$.messageId')) AND parent.${quote('key')} LIKE 'audit-alert:%')`;

      for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
        const name = 'audit_capture_' + table + '_' + operation.toLowerCase();
        const ref = operation === 'DELETE' ? 'OLD' : 'NEW';
        const actorRef = "NULLIF(@app_audit_actor,'')";
        const correlationRef = "NULLIF(@app_audit_correlation,'')";
        const before = operation === 'INSERT' ? 'NULL' : jsonObject('OLD');
        const after = operation === 'DELETE' ? 'NULL' : jsonObject('NEW');
        const scopeKey = `CASE WHEN ${tenant(ref)} IS NULL THEN 'platform' ELSE CONCAT('tenant:',CAST(${tenant(ref)} AS CHAR)) END`;
        const roleMap = table === 'roles'
          ? `INSERT INTO audit_role_scopes (${quote('roleId')},${quote('companyId')}) VALUES (${ref}.id,${ref}.${quote('companyId')}) ON DUPLICATE KEY UPDATE ${quote('companyId')}=VALUES(${quote('companyId')});`
          : '';
        const capture = `${roleMap}
          INSERT INTO audit_scope_catalog (${quote('scopeKey')},${quote('companyId')}) VALUES (${scopeKey},${tenant(ref)}) ON DUPLICATE KEY UPDATE ${quote('companyId')}=VALUES(${quote('companyId')});
          INSERT INTO audit_capture_events (id,${quote('companyId')},${quote('sourceId')},${quote('eventType')},${quote('resourceType')},${quote('resourceId')},${quote('actorId')},${quote('correlationId')},${quote('occurredAt')},payload)
          VALUES (UUID(),${tenant(ref)},'database',CONCAT('database.${table}.','${operation.toLowerCase()}'),'${table}',${resourceId(ref)},${actorRef},${correlationRef},UTC_TIMESTAMP(3),JSON_OBJECT('operation','${operation}','before',${before},'after',${after}));`;
        const body = table === 'communication_records'
          ? `BEGIN IF ${notificationGuard(ref)} THEN ${capture} END IF; END`
          : `BEGIN ${capture} END`;
        await q.sequelize.query(
          `CREATE TRIGGER IF NOT EXISTS ${quote(name)} AFTER ${operation} ON ${quote(table)} FOR EACH ROW ${body}`,
        );
      }
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
            (table === 'communication_records' ? ' WHEN ' + notificationCapture(ref) : '') +
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
            ",NULL,NULL,strftime('%Y-%m-%d %H:%M:%f +00:00','now'),json_object('operation','" +
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
    if (!['postgres', 'sqlite', 'mysql'].includes(q.sequelize.getDialect()))
      throw new Error('Audit migrations support PostgreSQL, MySQL 8, and SQLite tests.');
    const string = (n = 200) => ({ type: S.STRING(n), allowNull: false }),
      nullable = (n = 200) => ({ type: S.STRING(n), allowNull: true });
    const companyType = q.sequelize.getDialect() === 'mysql' ? S.INTEGER.UNSIGNED : S.INTEGER;
    const scope = { scopeKey: string(), companyId: { type: companyType, allowNull: true } };
    const record = {
      id: { type: S.UUID, primaryKey: true, allowNull: false },
      ...scope,
      eventId: string(),
      sourceId: string(),
      sequence: { type: S.BIGINT, allowNull: false },
      schemaVersion: { type: S.INTEGER, allowNull: false },
      eventType: string(),
      module: string(80),
      action: string(),
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
    if (q.sequelize.getDialect() === 'postgres') {
      const integer = new Set(['companyId', 'schemaVersion', 'policyVersion']);
      const columns = Object.entries(record).map(([name, attribute]) => {
        const type =
          name === 'id'
            ? 'UUID'
            : name === 'sequence'
              ? 'BIGINT'
              : integer.has(name)
                ? 'INTEGER'
                : ['occurredAt', 'receivedAt'].includes(name)
                  ? 'TIMESTAMPTZ'
                  : name === 'payload'
                    ? 'JSONB'
                    : attribute.type.toString();
        return `"${name}" ${type}${attribute.allowNull === true ? '' : ' NOT NULL'}`;
      });
      await q.sequelize.query(
        `CREATE TABLE audit_records (${columns.join(',')},PRIMARY KEY ("scopeKey",id,"receivedAt"),CHECK ("scopeKey"=CASE WHEN "companyId" IS NULL THEN 'platform' ELSE 'tenant:'||"companyId"::text END)) PARTITION BY RANGE ("receivedAt")`,
      );
      const now = new Date();
      for (let offset = -1; offset <= 2; offset++)
        await createAuditMonth(
          q,
          new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)),
        );
      await q.sequelize.query(
        'CREATE TABLE audit_records_default PARTITION OF audit_records DEFAULT',
      );
      await secureAuditPartition(q, 'audit_records_default');
      await q.sequelize
        .query(`CREATE TABLE audit_record_identities ("scopeKey" varchar(200) NOT NULL,"companyId" integer,id uuid NOT NULL,"sourceId" varchar(200) NOT NULL,"eventId" varchar(200) NOT NULL,sequence bigint NOT NULL,"receivedAt" timestamptz NOT NULL,PRIMARY KEY("scopeKey","sourceId","eventId"),UNIQUE("scopeKey",sequence),UNIQUE(id));
        CREATE FUNCTION audit_reserve_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN INSERT INTO audit_record_identities VALUES(NEW."scopeKey",NEW."companyId",NEW.id,NEW."sourceId",NEW."eventId",NEW.sequence,NEW."receivedAt"); RETURN NEW; END; $$;
        CREATE TRIGGER audit_reserve_identity BEFORE INSERT ON audit_records FOR EACH ROW EXECUTE FUNCTION audit_reserve_identity(); REVOKE ALL ON audit_record_identities FROM PUBLIC;`);
    } else {
      await q.createTable('audit_records', record);
      if (q.sequelize.getDialect() === 'mysql') {
        await q.createTable('audit_record_identities', {
          scopeKey: { ...string(), primaryKey: true },
          sourceId: { ...string(), primaryKey: true },
          eventId: { ...string(), primaryKey: true },
          companyId: { type: companyType, allowNull: true },
          id: { type: S.UUID, allowNull: false, unique: true },
          sequence: { type: S.BIGINT, allowNull: false },
          receivedAt: { type: S.DATE, allowNull: false },
        });
        await q.addIndex('audit_record_identities', ['scopeKey', 'sequence'], { unique: true });
      }
    }
    const temporal = q.sequelize.getDialect() === 'postgres' ? ['receivedAt'] : [];
    await q.addIndex('audit_records', ['scopeKey', 'sourceId', 'eventId', ...temporal], {
      unique: true,
    });
    await q.addIndex('audit_records', ['scopeKey', 'sequence', ...temporal], { unique: true });
    for (const index of [
      ['companyId', 'occurredAt'],
      ['scopeKey', 'actorId', 'sequence'],
      ['scopeKey', 'resourceType', 'resourceId'],
      ['scopeKey', 'correlationId'],
      ['scopeKey', 'category', 'outcome'],
      ['scopeKey', 'module', 'action', 'sequence'],
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
      for (const table of [
        'audit_records',
        'audit_record_identities',
        'audit_chain_heads',
        ...objectTables,
      ]) {
        await q.sequelize.query(
          `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY; ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY; CREATE POLICY "${table}_tenant" ON "${table}" USING ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer OR ("companyId" IS NULL AND NULLIF(current_setting('app.current_tenant', true), '') IS NULL)) WITH CHECK ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer OR ("companyId" IS NULL AND NULLIF(current_setting('app.current_tenant', true), '') IS NULL));`,
        );
      }
      await q.sequelize.query(
        `ALTER TABLE audit_capture_events ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_capture_events FORCE ROW LEVEL SECURITY; CREATE POLICY audit_capture_select ON audit_capture_events FOR SELECT USING (\"companyId\" = NULLIF(current_setting('app.current_tenant',true),'')::integer OR (\"companyId\" IS NULL AND NULLIF(current_setting('app.current_tenant',true),'') IS NULL)); CREATE POLICY audit_capture_insert ON audit_capture_events FOR INSERT WITH CHECK (true); CREATE POLICY audit_capture_update ON audit_capture_events FOR UPDATE USING (\"companyId\" = NULLIF(current_setting('app.current_tenant',true),'')::integer OR (\"companyId\" IS NULL AND NULLIF(current_setting('app.current_tenant',true),'') IS NULL));`,
      );
      await q.sequelize.query(
        `CREATE FUNCTION audit_reject_record_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit records are append-only'; END; $$; CREATE TRIGGER audit_record_immutable BEFORE UPDATE OR DELETE ON audit_records FOR EACH ROW EXECUTE FUNCTION audit_reject_record_mutation(); CREATE TRIGGER audit_record_no_truncate BEFORE TRUNCATE ON audit_records FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_record_mutation(); REVOKE UPDATE,DELETE,TRUNCATE ON audit_records FROM PUBLIC;`,
      );
      await q.sequelize.query(
        'CREATE TRIGGER audit_identities_immutable BEFORE UPDATE OR DELETE ON audit_record_identities FOR EACH ROW EXECUTE FUNCTION audit_reject_record_mutation(); CREATE TRIGGER audit_identities_no_truncate BEFORE TRUNCATE ON audit_record_identities FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_record_mutation();',
      );
      const [parts] = await q.sequelize.query(
        "SELECT c.relname AS name FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid WHERE i.inhparent='audit_records'::regclass",
      );
      for (const part of parts) await secureAuditPartition(q, part.name);
    } else if (q.sequelize.getDialect() === 'sqlite')
      for (const op of ['UPDATE', 'DELETE'])
        await q.sequelize.query(
          `CREATE TRIGGER audit_record_immutable_${op.toLowerCase()} BEFORE ${op} ON audit_records BEGIN SELECT RAISE(ABORT,'audit records are append-only'); END;`,
        );
    else if (q.sequelize.getDialect() === 'mysql') {
      await q.sequelize.query(
        "CREATE TRIGGER IF NOT EXISTS audit_reserve_identity BEFORE INSERT ON audit_records FOR EACH ROW INSERT INTO audit_record_identities (scopeKey,companyId,id,sourceId,eventId,sequence,receivedAt) VALUES (NEW.scopeKey,NEW.companyId,NEW.id,NEW.sourceId,NEW.eventId,NEW.sequence,NEW.receivedAt)",
      );
      for (const [table, operations, message] of [
        ['audit_records', ['UPDATE', 'DELETE'], 'Audit records are append-only'],
        ['audit_record_identities', ['UPDATE', 'DELETE'], 'Audit identities are immutable'],
      ]) {
        for (const operation of operations) {
          const name = `${table}_${operation.toLowerCase()}_immutable`;
          await q.sequelize.query(
            `CREATE TRIGGER IF NOT EXISTS ${q.queryGenerator.quoteIdentifier(name)} BEFORE ${operation} ON ${q.queryGenerator.quoteIdentifier(table)} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}'`,
          );
        }
      }
    }
  },
  async down() {
    throw new Error(
      'Audit history is append-only. Rollback requires an explicit, reviewed archival migration.',
    );
  },
  installCapture,
};
