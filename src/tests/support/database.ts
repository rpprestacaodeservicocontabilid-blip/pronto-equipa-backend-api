import path from 'path';

import { sequelize } from '../../infra/database';
import { TEST_MODELS } from './models';

/**
 * Migrations-seed executadas após a sincronização.
 *
 * As 131 migrações NÃO correm nos testes (a última delas demora
 * ~40 s e reconstrói o esquema legado inteiro). Apenas as duas
 * seeds necessárias à Fase 1 são reexecutadas — são idempotentes:
 *
 *  - `seed-system-roles`       → roles canónicas (ADMIN, SUPER_ADMIN, ...)
 *  - `seed-company-permissions`→ catálogo de permissões + ligações
 *                                ADMIN/SUPER_ADMIN → company.* / audit.read
 *  - `seed-employee-permissions` → catálogo employees.* (sem grants automáticos)
 *  - `seed-contract-permissions` → catálogo contracts.* (sem grants automáticos)
 *  - `seed-organization-permissions` → catálogo organization:* (sem grants automáticos)
 *  - `seed-leave-permissions` → catálogo leave.* (sem grants automáticos)
 *  - `seed-attendance-permissions` → catálogo attendance.* (sem grants automáticos)
 *  - `seed-loan-permissions` → catálogo loans.* (sem grants automáticos)
 *  - `seed-salary-structure-permissions` → catálogo salary-structure:* (sem grants automáticos)
 */
const SEED_MIGRATIONS = [
  '20261013000000-seed-system-roles.js',
  '20261106000005-seed-company-permissions.js',
  '20261108000001-seed-employee-permissions.js',
  '20261109000000-seed-contract-permissions.js',
  '20261109000002-seed-organization-permissions.js',
  '20261109000011-seed-leave-permissions.js',
  '20261109000013-seed-attendance-permissions.js',
  '20261109000015-seed-loan-permissions.js',
  '20261109000017-seed-salary-structure-permissions.js',
  '20261113000001-seed-payroll-permissions.js',
  '20261113000003-seed-payroll-workflow-permissions.js',
] as const;

interface SeedMigration {
  up(queryInterface: unknown): Promise<void>;
}

/**
 * Repõe a base de testes de raiz:
 *
 *  1. `dropAllTables()` — tudo menos `sequelize_migrations`
 *     (o histórico é preservado para `db:migrate --env test` continuar
 *     a ser um no-op);
 *  2. `sync()` de cada modelo de `TEST_MODELS` (uma tabela por modelo);
 *  3. `up()` das migrations-seed.
 *
 * Corre com `maxWorkers: 1` — a base é um ficheiro SQLite partilhado
 * e o reset é destrutivo por ficheiro de teste.
 */
export async function resetTestDatabase(): Promise<void> {
  const queryInterface = sequelize.getQueryInterface();

  await queryInterface.dropAllTables({
    skip: ['sequelize_migrations'],
  });

  for (const model of TEST_MODELS) {
    await model.sync();
  }

  for (const file of SEED_MIGRATIONS) {
    const migration = require(
      path.join(__dirname, '../../infra/database/migrations', file),
    ) as SeedMigration;

    await migration.up(queryInterface);
  }
}
