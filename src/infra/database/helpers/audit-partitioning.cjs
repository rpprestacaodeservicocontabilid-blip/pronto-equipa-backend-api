'use strict';
async function secureAuditPartition(q, name) {
  if (!/^audit_records_(?:\d{4}_\d{2}|default)$/.test(name))
    throw new Error('Invalid audit partition identifier.');
  await q.sequelize
    .query(`ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY; ALTER TABLE "${name}" FORCE ROW LEVEL SECURITY;
  DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='${name}' AND policyname='${name}_tenant') THEN
  CREATE POLICY "${name}_tenant" ON "${name}" USING ("companyId"=NULLIF(current_setting('app.current_tenant',true),'')::integer OR ("companyId" IS NULL AND NULLIF(current_setting('app.current_tenant',true),'') IS NULL)) WITH CHECK ("companyId"=NULLIF(current_setting('app.current_tenant',true),'')::integer OR ("companyId" IS NULL AND NULLIF(current_setting('app.current_tenant',true),'') IS NULL)); END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE proname='audit_reject_record_mutation') AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='${name}'::regclass AND tgname='audit_record_no_truncate') THEN
  CREATE TRIGGER audit_record_no_truncate BEFORE TRUNCATE ON "${name}" FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_record_mutation(); END IF; END; $$;
  REVOKE ALL ON "${name}" FROM PUBLIC;`);
}
async function createAuditMonth(q, date) {
  const at = new Date(date);
  if (Number.isNaN(at.getTime()) || at.getUTCFullYear() < 2000 || at.getUTCFullYear() > 9998)
    throw new Error('Invalid audit partition month.');
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)),
    end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
  const name = `audit_records_${start.getUTCFullYear()}_${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
  await q.sequelize.query(
    `CREATE TABLE IF NOT EXISTS "${name}" PARTITION OF audit_records FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')`,
  );
  await secureAuditPartition(q, name);
  return name;
}
module.exports = { createAuditMonth, secureAuditPartition };
