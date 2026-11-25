'use strict';

const grants = [
  ['employees.tax.read', 'Consultar identificação fiscal e contributiva.'],
  ['employees.tax.manage', 'Gerir identificação fiscal e contributiva.'],
  ['employees.registration.review', 'Aprovar e rejeitar cadastros de trabalhadores.'],
];
const tables = ['employee_profile_sections', 'employee_registrations'];

module.exports = {
  async up(query, Sequelize) {
    const db = query.sequelize;
    await db.transaction(async transaction => {
      const options = { transaction };
      const company = { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, references: { model: 'companies', key: 'id' }, onDelete: 'CASCADE' };
      const timestamps = {
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      };
      await query.createTable(tables[0], {
        companyId: { ...company, primaryKey: true },
        employeeId: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
        section: { type: Sequelize.STRING(32), allowNull: false, primaryKey: true },
        content: { type: Sequelize.JSON, allowNull: false },
        version: { type: Sequelize.INTEGER, allowNull: false },
        ...timestamps,
      }, options);
      await query.addConstraint(tables[0], {
        ...options, fields: ['companyId', 'employeeId'], type: 'foreign key',
        name: 'fk_employee_profile_sections_employee',
        references: { table: 'employees', fields: ['companyId', 'id'] }, onDelete: 'CASCADE',
      });
      await query.createTable(tables[1], {
        id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
        companyId: company,
        createdBy: { type: Sequelize.INTEGER, allowNull: false },
        reviewedBy: { type: Sequelize.INTEGER, allowNull: true },
        status: { type: Sequelize.STRING(20), allowNull: false },
        version: { type: Sequelize.INTEGER, allowNull: false },
        content: { type: Sequelize.JSON, allowNull: false },
        decisionReason: { type: Sequelize.STRING(500), allowNull: true },
        ...timestamps,
      }, options);
      await query.addIndex(tables[1], ['companyId', 'status', 'updatedAt'], options);
      if (db.getDialect() === 'postgres') {
        for (const table of tables) {
          await db.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`, options);
          await db.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`, options);
          await db.query(`CREATE POLICY ${table}_tenant ON ${table}
            USING ("companyId"::text = current_setting('app.current_tenant', true))
            WITH CHECK ("companyId"::text = current_setting('app.current_tenant', true))`, options);
        }
      }
      const now = new Date();
      await query.bulkInsert('permissions', grants.map(([name, description]) => ({
        name, description, resource: 'employees', action: name.split('.').at(-1), scope: 'TENANT', isSystem: true,
        createdAt: now, updatedAt: now,
      })), options);
    });
  },
  async down(query) {
    await query.sequelize.transaction(async transaction => {
      for (const table of [...tables].reverse()) await query.dropTable(table, { transaction });
      await query.bulkDelete('permissions', { name: grants.map(([name]) => name) }, { transaction });
    });
  },
};
