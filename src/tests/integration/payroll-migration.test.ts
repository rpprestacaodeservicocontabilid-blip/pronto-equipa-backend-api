import { Sequelize, DataTypes } from 'sequelize';

const migration = require('../../infra/database/migrations/20261113000000-create-payroll.js');
const workflowMigration = require('../../infra/database/migrations/20261113000002-complete-payroll-workflow.js');

describe('Payroll migration (isolated SQLite)', () => {
  const db = new Sequelize('sqlite::memory:', { logging: false });
  const q = db.getQueryInterface();
  afterAll(async () => {
    await db.close();
  });
  test('creates tables, enforces tenant-scoped idempotency and rolls back schema', async () => {
    await q.createTable('companies', { id: { type: DataTypes.INTEGER, primaryKey: true } });
    await q.bulkInsert('companies', [{ id: 1 }, { id: 2 }]);
    await migration.up(q, DataTypes);
    await workflowMigration.up(q, DataTypes);
    const tables = await q.showAllTables();
    expect(tables).toContain('payroll_employee_results');
    expect(tables).toContain('payroll_input_snapshots');
    expect(tables).toContain('payroll_closings');
    const now = new Date();
    const row = {
      id: 'run-1',
      companyId: 1,
      periodId: 'period-1',
      runType: 'REGULAR',
      executionScope: 'INDIVIDUAL',
      employeeIds: '[]',
      status: 'DRAFT',
      version: 1,
      createdBy: 1,
      idempotencyKey: 'same-key',
      requestHash: 'hash',
      createdAt: now,
      updatedAt: now,
    };
    await q.bulkInsert('payroll_runs', [row]);
    await expect(q.bulkInsert('payroll_runs', [{ ...row, id: 'run-2' }])).rejects.toThrow();
    await q.bulkInsert('payroll_runs', [{ ...row, id: 'run-3', companyId: 2 }]);
    await workflowMigration.down(q);
    await migration.down(q);
    expect(await q.showAllTables()).not.toContain('payroll_runs');
  });
});
