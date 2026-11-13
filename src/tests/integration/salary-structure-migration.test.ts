import { QueryInterface } from 'sequelize';
import { sequelize } from '../../infra/database';
import { resetTestDatabase } from '../support/database';

jest.setTimeout(60_000);

const tables = [
  'salary_snapshots',
  'salary_revision_items',
  'salary_revision_batches',
  'salary_revisions',
  'employee_salary_components',
  'employee_salary_assignments',
  'salary_structure_items',
  'salary_structure_versions',
  'salary_structures',
  'salary_steps',
  'salary_grades',
  'salary_table_versions',
  'salary_tables',
  'salary_component_versions',
  'salary_components',
  'salary_policies',
  'salary_structure_outbox',
];

interface Migration {
  up(queryInterface: QueryInterface, Sequelize: typeof import('sequelize')): Promise<void>;
  down(queryInterface: QueryInterface): Promise<void>;
}

describe('Salary structure migration', () => {
  it('creates and drops the salary structure schema in SQLite', async () => {
    await resetTestDatabase();
    const queryInterface = sequelize.getQueryInterface();
    for (const table of tables) await queryInterface.dropTable(table);

    const migration =
      require('../../infra/database/migrations/20261109000016-create-salary-structure.js') as Migration;
    await migration.up(queryInterface, require('sequelize'));
    const createdTables = await queryInterface.showAllTables();
    for (const table of tables) expect(createdTables).toContain(table);

    await migration.down(queryInterface);
    const remainingTables = await queryInterface.showAllTables();
    for (const table of tables) expect(remainingTables).not.toContain(table);
  });
});
