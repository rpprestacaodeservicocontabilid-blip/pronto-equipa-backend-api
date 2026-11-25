import { randomUUID } from 'crypto';
import { DataTypes, QueryTypes, Sequelize } from 'sequelize';

// Opt-in infrastructure verification. Creates its own schema and temporary role;
// never migrates or clears application tables. Credentials must be test-only.
const suite = process.env.PAYROLL_TEST_POSTGRES_URL ? describe : describe.skip;
suite('Payroll PostgreSQL RLS and immutability', () => {
  let admin: Sequelize, db: Sequelize;
  const schema = `payroll_test_${randomUUID().replace(/-/g, '')}`;
  const role = `${schema}_role`;
  const periodId = randomUUID(),
    runId = randomUUID(),
    employeeId = randomUUID(),
    resultId = randomUUID();
  beforeAll(async () => {
    const url = process.env.PAYROLL_TEST_POSTGRES_URL!;
    if (!new URL(url).pathname.endsWith('_test'))
      throw new Error('PostgreSQL verification requires a database ending in _test');
    admin = new Sequelize(url, { logging: false });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = new Sequelize(url, {
      schema,
      logging: false,
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    const q = db.getQueryInterface();
    await q.createTable('companies', { id: { type: DataTypes.INTEGER, primaryKey: true } });
    await q.bulkInsert('companies', [{ id: 1 }, { id: 2 }]);
    await q.createTable('employees', {
      id: { type: DataTypes.UUID, primaryKey: true },
      companyId: { type: DataTypes.INTEGER, allowNull: false },
    });
    await q.addIndex('employees', ['companyId', 'id'], { unique: true });
    await q.bulkInsert('employees', [{ id: employeeId, companyId: 1 }]);
    await require('../../infra/database/migrations/20261113000000-create-payroll').up(q, DataTypes);
    await require('../../infra/database/migrations/20261113000002-complete-payroll-workflow').up(
      q,
      DataTypes,
    );
    await admin.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${role}"`,
    );
  }, 60000);
  afterAll(async () => {
    await db?.close();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.query(`DROP ROLE IF EXISTS "${role}"`);
      await admin.close();
    }
  });
  const tenant = async <T>(
    companyId: number,
    operation: (transaction: import('sequelize').Transaction) => Promise<T>,
  ) =>
    db.transaction(async (transaction) => {
      await db.query(`SET LOCAL ROLE "${role}"`, { transaction });
      await db.query("SELECT set_config('app.current_tenant', :id, true)", {
        replacements: { id: String(companyId) },
        transaction,
      });
      return operation(transaction);
    });
  test('tenant context prevents salary reads and writes across companies', async () => {
    await tenant(1, async (transaction) => {
      await db.query(
        `INSERT INTO payroll_periods (id, "companyId", "startDate", "endDate", "paymentDate", status, version, "createdBy", "createdAt", "updatedAt") VALUES (:id,1,'2026-01-01','2026-01-31','2026-01-31','OPEN',1,1,NOW(),NOW())`,
        { replacements: { id: periodId }, transaction },
      );
    });
    const rows = await tenant(2, (transaction) =>
      db.query('SELECT * FROM payroll_periods', { type: QueryTypes.SELECT, transaction }),
    );
    expect(rows).toHaveLength(0);
    await expect(
      tenant(2, (transaction) =>
        db.query(
          `INSERT INTO payroll_runs (id,"companyId","periodId","runType","executionScope","employeeIds",status,version,"createdBy","idempotencyKey","requestHash","createdAt","updatedAt") VALUES (:id,1,:period,'REGULAR','INDIVIDUAL','[]','DRAFT',1,1,'key','hash',NOW(),NOW())`,
          { replacements: { id: runId, period: periodId }, transaction },
        ),
      ),
    ).rejects.toThrow();
  });
  test('closed results cannot be changed or moved to another execution', async () => {
    await tenant(1, async (transaction) => {
      await db.query(
        `INSERT INTO payroll_runs (id,"companyId","periodId","runType","executionScope","employeeIds",status,version,"createdBy","idempotencyKey","requestHash","createdAt","updatedAt") VALUES (:id,1,:period,'REGULAR','INDIVIDUAL','[]','DRAFT',1,1,'key','hash',NOW(),NOW())`,
        { replacements: { id: runId, period: periodId }, transaction },
      );
      await db.query(
        `INSERT INTO payroll_employee_results (id,"companyId","runId","employeeId","grossAmount","deductionsAmount","netAmount","employerCostsAmount",currency,"calculationSnapshot","createdAt","updatedAt") VALUES (:id,1,:run,:employee,100,10,90,0,'AOA','{}',NOW(),NOW())`,
        { replacements: { id: resultId, run: runId, employee: employeeId }, transaction },
      );
      await db.query(`UPDATE payroll_runs SET status='CLOSED' WHERE id=:id`, {
        replacements: { id: runId },
        transaction,
      });
    });
    await expect(
      tenant(1, (transaction) =>
        db.query(
          `UPDATE payroll_employee_results SET "netAmount"=89,"deductionsAmount"=11 WHERE id=:id`,
          { replacements: { id: resultId }, transaction },
        ),
      ),
    ).rejects.toThrow('immutable');
    await expect(
      tenant(1, (transaction) =>
        db.query(`UPDATE payroll_runs SET status='DRAFT' WHERE id=:id`, {
          replacements: { id: runId },
          transaction,
        }),
      ),
    ).rejects.toThrow('immutable');
  });
});
