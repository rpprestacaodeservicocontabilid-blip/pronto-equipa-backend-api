import { randomUUID } from 'crypto';
import { Sequelize, DataTypes, QueryTypes } from 'sequelize';

// Opt-in only: use an empty, disposable database whose name ends in _audit_test.
const enabled = Boolean(process.env.AUDIT_TEST_POSTGRES_URL);
const suite = enabled ? describe : describe.skip;
suite('Audit PostgreSQL migration, RLS and partition protections', () => {
  jest.setTimeout(120000);
  test('forces tenant isolation on the parent and every partition, and blocks update/delete/truncate', async () => {
    const url = process.env.AUDIT_TEST_POSTGRES_URL!;
    const database = new URL(url).pathname.slice(1);
    if (!/^[a-z0-9_]+_audit_test$/.test(database))
      throw new Error('Use a disposable database ending in _audit_test.');
    const db = new Sequelize(url, { logging: false }),
      q = db.getQueryInterface();
    const role = `pe_audit_test_${randomUUID().replace(/-/g, '')}`;
    const migration =
      require('../../infra/database/migrations/20261116000010-create-audit-engine.js') as {
        up(q: unknown, s: unknown): Promise<void>;
      };
    let initialized = false,
      roleCreated = false;
    try {
      if ((await q.showAllTables()).length)
        throw new Error(
          'PostgreSQL audit test requires an empty database; no existing tables will be removed.',
        );
      initialized = true;
      await q.createTable('companies', {
        id: { type: DataTypes.INTEGER, primaryKey: true },
        status: DataTypes.STRING,
      });
      await q.createTable('roles', {
        id: { type: DataTypes.INTEGER, primaryKey: true },
        companyId: DataTypes.INTEGER,
      });
      await q.createTable('role_permissions', {
        roleId: { type: DataTypes.INTEGER, primaryKey: true },
        permissionId: { type: DataTypes.INTEGER, primaryKey: true },
      });
      await migration.up(q, DataTypes);
      await db.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
      roleCreated = true;
      await db.query(
        `GRANT USAGE ON SCHEMA public TO "${role}"; GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON ALL TABLES IN SCHEMA public TO "${role}"`,
      );
      for (const companyId of [1, 2])
        await db.transaction(async (transaction) => {
          await db.query("SELECT set_config('app.current_tenant',:tenant,true)", {
            replacements: { tenant: String(companyId) },
            transaction,
          });
          const now = new Date(),
            hash = '0'.repeat(64);
          await q.bulkInsert(
            'audit_records',
            [
              {
                id: randomUUID(),
                scopeKey: `tenant:${companyId}`,
                companyId,
                eventId: randomUUID(),
                sourceId: 'test',
                sequence: 1,
                schemaVersion: 1,
                eventType: 'test.changed',
                module: 'test',
                action: 'CHANGE',
                category: 'DATA_CHANGE',
                severity: 'MEDIUM',
                outcome: 'SUCCESS',
                actorId: '10',
                resourceType: 'employee',
                resourceId: 'e1',
                correlationId: null,
                sensitivity: 'STANDARD',
                occurredAt: now,
                receivedAt: now,
                policyVersion: 1,
                inputHash: hash,
                previousHash: hash,
                payloadHash: hash,
                recordHash: hash,
                payload: JSON.stringify({ test: true }),
              },
            ],
            { transaction },
          );
        });
      await db.transaction(async (transaction) => {
        await db.query(`SET LOCAL ROLE "${role}"`, { transaction });
        await db.query("SELECT set_config('app.current_tenant','1',true)", { transaction });
        const rows = await db.query<{ companyId: number }>(
          'SELECT "companyId" FROM audit_records',
          { type: QueryTypes.SELECT, transaction },
        );
        expect(rows).toEqual([{ companyId: 1 }]);
        const partitions = await db.query<{ name: string }>(
          "SELECT c.relname AS name FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid WHERE i.inhparent='audit_records'::regclass",
          { type: QueryTypes.SELECT, transaction },
        );
        expect(partitions.length).toBeGreaterThanOrEqual(5);
        for (const partition of partitions) {
          const rows = await db.query<{ companyId: number }>(
            `SELECT "companyId" FROM "${partition.name.replace(/"/g, '""')}"`,
            { type: QueryTypes.SELECT, transaction },
          );
          expect(rows.every((row) => row.companyId === 1)).toBe(true);
        }
      });
      for (const statement of [
        'UPDATE audit_records SET severity=\'LOW\' WHERE "companyId"=1',
        'DELETE FROM audit_records WHERE "companyId"=1',
        'TRUNCATE audit_records',
        'TRUNCATE audit_records_default',
        'TRUNCATE audit_record_identities',
      ])
        await expect(
          db.transaction(async (transaction) => {
            await db.query(`SET LOCAL ROLE "${role}"`, { transaction });
            await db.query("SELECT set_config('app.current_tenant','1',true)", { transaction });
            await db.query(statement, { transaction });
          }),
        ).rejects.toThrow();
      await expect(
        db.transaction(async (transaction) => {
          await db.query("INSERT INTO companies VALUES (1,'ACTIVE')", { transaction });
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect(
        await db.query('SELECT * FROM audit_capture_events', { type: QueryTypes.SELECT }),
      ).toHaveLength(0);
      await db.query(
        "INSERT INTO companies VALUES (1,'ACTIVE'); INSERT INTO roles VALUES (1,1); INSERT INTO role_permissions VALUES (1,2)",
      );
      expect(
        await db.query('SELECT * FROM audit_capture_events', { type: QueryTypes.SELECT }),
      ).toHaveLength(3);
    } finally {
      // Only objects created in this previously empty test database are removed.
      if (initialized) {
        for (const table of (await q.showAllTables()).reverse())
          await q.dropTable(table, { cascade: true });
        const functions = await db.query<{ name: string }>(
          "SELECT proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (proname LIKE 'audit_capture_%' OR proname IN ('audit_reject_record_mutation','audit_reserve_identity'))",
          { type: QueryTypes.SELECT },
        );
        for (const fn of functions)
          await db.query(`DROP FUNCTION public."${fn.name.replace(/"/g, '""')}"() CASCADE`);
      }
      if (roleCreated) await db.query(`DROP OWNED BY "${role}"; DROP ROLE "${role}"`);
      await db.close();
    }
  });
});
