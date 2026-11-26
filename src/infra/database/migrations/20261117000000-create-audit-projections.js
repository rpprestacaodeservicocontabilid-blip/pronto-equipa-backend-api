'use strict';
// Read-only relational projections over the immutable ledger and versioned workflows.
const names = [
  'audit_actors',
  'audit_resources',
  'audit_change_sets',
  'audit_field_changes',
  'audit_contexts',
  'audit_integrity_batches',
  'audit_record_integrity',
  'audit_legal_hold_resources',
  'audit_investigation_events',
  'audit_evidence_items',
  'audit_export_files',
  'audit_export_approvals',
];

module.exports = {
  async up(q) {
    const dialect = q.sequelize.getDialect();
    const pg = dialect === 'postgres';
    const mysql = dialect === 'mysql';
    const quote = (name) => q.queryGenerator.quoteIdentifier(name);
    const column = (alias, name) => `${alias}.${quote(name)}`;
    const jsonPath = (path) => `$.${path}`;
    const json = (expression, path) => {
      if (pg) return `(${expression}::jsonb #>> '{${path.split('.').join(',')}}')`;
      if (mysql) return `JSON_UNQUOTE(JSON_EXTRACT(${expression},'${jsonPath(path)}'))`;
      return `CAST(json_extract(${expression},'${jsonPath(path)}') AS TEXT)`;
    };
    const array = (expression, path) => {
      if (pg) {
        const value = `(${expression}::jsonb #> '{${path.split('.').join(',')}}')`;
        return `jsonb_array_elements(CASE WHEN jsonb_typeof(${value})='array' THEN ${value} ELSE '[]'::jsonb END) WITH ORDINALITY`;
      }
      if (mysql) {
        const value = `JSON_EXTRACT(${expression},'${jsonPath(path)}')`;
        return `JSON_TABLE(CASE WHEN JSON_TYPE(${value})='ARRAY' THEN ${value} ELSE JSON_ARRAY() END,'$[*]' COLUMNS(position FOR ORDINALITY,value JSON PATH '$'))`;
      }
      const value = `json_extract(${expression},'${jsonPath(path)}')`;
      return `json_each(CASE WHEN json_type(${expression},'${jsonPath(path)}')='array' THEN ${value} ELSE '[]' END)`;
    };
    const item = 'a.value';
    const scope = (alias) => `${column(alias, 'scopeKey')},${column(alias, 'companyId')}`;
    const asText = (expression) => `CAST(${expression} AS ${mysql ? 'CHAR' : 'TEXT'})`;
    const create = async (name, sql) => {
      const view = quote(name);
      const prefix = mysql
        ? `CREATE OR REPLACE SQL SECURITY INVOKER VIEW ${view}`
        : pg
          ? `CREATE VIEW ${view} WITH (security_invoker=true,security_barrier=true)`
          : `CREATE VIEW ${view}`;
      await q.sequelize.query(`${prefix} AS ${sql}`);
    };

    await create(
      'audit_actors',
      `SELECT r.id,r.id AS record_id,${scope('r')},${column('r', 'actorId')} AS actor_id,${json('r.payload', 'actor.actorType')} AS actor_type,${json('r.payload', 'actor.sessionId')} AS session_id FROM audit_records r`,
    );
    await create(
      'audit_resources',
      `SELECT r.id,r.id AS record_id,${scope('r')},${column('r', 'resourceType')} AS resource_type,${column('r', 'resourceId')} AS resource_id,${json('r.payload', 'resource.resourceVersion')} AS resource_version FROM audit_records r`,
    );
    await create(
      'audit_change_sets',
      `SELECT r.id,r.id AS record_id,${scope('r')},r.action AS change_type,${column('r', 'schemaVersion')} AS schema_version FROM audit_records r`,
    );
    await create(
      'audit_field_changes',
      `SELECT r.id AS change_set_id,${scope('r')},${json(item, 'field')} AS field_path,${json(item, 'before')} AS before_value,${json(item, 'after')} AS after_value FROM audit_records r CROSS JOIN ${pg ? 'LATERAL ' : ''}${array('r.payload', 'changes')} AS a${pg ? '(value,position)' : ''}`,
    );
    await create(
      'audit_contexts',
      `SELECT r.id,r.id AS record_id,${scope('r')},r.module,${column('r', 'sourceId')} AS source_id,${column('r', 'eventId')} AS source_event_id,${column('r', 'correlationId')} AS correlation_id,${json('r.payload', 'causationId')} AS causation_id,${json('r.payload', 'requestId')} AS request_id,${column('r', 'receivedAt')} AS received_at,${column('r', 'receivedAt')} AS confirmation_timestamp,${column('r', 'policyVersion')} AS policy_version FROM audit_records r`,
    );
    const sequence = (expression) => `CAST(${json(expression, 'statement.sequence')} AS ${mysql ? 'SIGNED' : 'BIGINT'})`;
    await create(
      'audit_integrity_batches',
      `SELECT p.id,${scope('p')},COALESCE(LAG(${sequence('p.data')}) OVER (PARTITION BY ${column('p', 'scopeKey')} ORDER BY ${sequence('p.data')},p.id),0)+1 AS sequence_start,${sequence('p.data')} AS sequence_end,p.status,${json('p.data', 'statement.recordHash')} AS root_hash,p.id AS checkpoint_id FROM audit_integrity_checkpoints p`,
    );
    await create(
      'audit_record_integrity',
      `SELECT r.id AS record_id,${scope('r')},b.id AS batch_id,b.checkpoint_id FROM audit_records r JOIN audit_integrity_batches b ON ${column('b', 'scopeKey')}=${column('r', 'scopeKey')} AND r.sequence BETWEEN b.sequence_start AND b.sequence_end`,
    );
    const arrayValue = mysql ? `JSON_UNQUOTE(${item})` : pg ? `${item} #>> '{}'` : item;
    await create(
      'audit_legal_hold_resources',
      `SELECT h.id AS legal_hold_id,${scope('h')},'AUDIT_RECORD' AS resource_type,${arrayValue} AS resource_id FROM audit_legal_holds h CROSS JOIN ${pg ? 'LATERAL ' : ''}${array('h.data', 'recordIds')} AS a${pg ? '(value,position)' : ''} UNION ALL SELECT h.id,${scope('h')},COALESCE(${json('h.data', 'resourceType')},'*'),COALESCE(${json('h.data', 'resourceId')},'*') FROM audit_legal_holds h WHERE ${json('h.data', 'resourceType')} IS NOT NULL OR ${json('h.data', 'wholeScope')} IN ('true','1')`,
    );
    await create(
      'audit_investigation_events',
      `SELECT i.id AS investigation_id,${scope('i')},${json(item, 'type')} AS event_type,${json(item, 'at')} AS occurred_at,${json(item, 'actorId')} AS actor_id FROM audit_investigations i CROSS JOIN ${pg ? 'LATERAL ' : ''}${array('i.data', 'events')} AS a${pg ? '(value,position)' : ''}`,
    );
    await create(
      'audit_evidence_items',
      `SELECT p.id AS package_id,${scope('p')},r.id AS record_id,${column('r', 'recordHash')} AS checksum FROM audit_evidence_packages p CROSS JOIN ${pg ? 'LATERAL ' : ''}${array('p.data', 'recordIds')} AS a${pg ? '(value,position)' : ''} JOIN audit_records r ON ${column('r', 'scopeKey')}=${column('p', 'scopeKey')} AND ${asText(column('r', 'id'))}=${arrayValue}`,
    );
    await create(
      'audit_export_approvals',
      `SELECT e.id AS export_request_id,${scope('e')},${json('e.data', 'approverId')} AS approver_id,${json('e.data', 'decision')} AS decision,${json('e.data', 'decidedAt')} AS decided_at,${json('e.data', 'reason')} AS reason FROM audit_export_requests e WHERE ${json('e.data', 'decision')} IS NOT NULL`,
    );
    await create(
      'audit_export_files',
      `SELECT e.id AS export_request_id,${scope('e')},p.id AS evidence_id,${json('p.data', 'storageKey')} AS storage_reference,${json('p.data', 'checksum')} AS checksum FROM audit_export_requests e JOIN audit_evidence_packages p ON ${column('p', 'scopeKey')}=${column('e', 'scopeKey')} AND ${asText(column('p', 'id'))}=${json('e.data', 'evidenceId')}`,
    );
  },
  async down(q) {
    const quote = (name) => q.queryGenerator.quoteIdentifier(name);
    for (const name of [...names].reverse()) await q.sequelize.query(`DROP VIEW IF EXISTS ${quote(name)}`);
  },
  names,
};
