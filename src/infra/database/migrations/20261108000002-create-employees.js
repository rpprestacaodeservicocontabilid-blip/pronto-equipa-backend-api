'use strict';

/**
 * Employees core records and effective-dated histories.
 * PostgreSQL RLS supplements (never replaces) tenant-scoped repository queries.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('employees', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      employeeNumber: { type: Sequelize.STRING(50), allowNull: false },
      firstName: { type: Sequelize.STRING(100), allowNull: false },
      lastName: { type: Sequelize.STRING(100), allowNull: false },
      dateOfBirth: { type: Sequelize.DATEONLY, allowNull: true },
      nationality: { type: Sequelize.STRING(80), allowNull: true },
      email: { type: Sequelize.STRING(255), allowNull: true },
      phone: { type: Sequelize.STRING(40), allowNull: true },
      admissionDate: { type: Sequelize.DATEONLY, allowNull: false },
      departmentId: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      jobTitle: { type: Sequelize.STRING(150), allowNull: true },
      jobCategory: { type: Sequelize.STRING(100), allowNull: true },
      status: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'ACTIVE' },
      terminationDate: { type: Sequelize.DATEONLY, allowNull: true },
      terminationReason: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('employees', ['companyId', 'employeeNumber'], {
      unique: true,
      name: 'uq_employees_company_number',
    });
    await queryInterface.addIndex('employees', ['companyId', 'status'], {
      name: 'idx_employees_company_status',
    });
    await queryInterface.addIndex('employees', ['companyId', 'lastName', 'firstName'], {
      name: 'idx_employees_company_name',
    });
    await queryInterface.addIndex('employees', ['companyId', 'id'], {
      unique: true,
      name: 'uq_employees_company_id',
    });

    await queryInterface.createTable('employee_professional_history', {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      employeeId: { type: Sequelize.UUID, allowNull: false },
      departmentId: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      jobTitle: { type: Sequelize.STRING(150), allowNull: true },
      jobCategory: { type: Sequelize.STRING(100), allowNull: true },
      effectiveFrom: { type: Sequelize.DATEONLY, allowNull: false },
      effectiveTo: { type: Sequelize.DATEONLY, allowNull: true },
      reason: { type: Sequelize.STRING(500), allowNull: true },
      changedBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('employee_status_history', {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      employeeId: { type: Sequelize.UUID, allowNull: false },
      fromStatus: { type: Sequelize.STRING(30), allowNull: true },
      toStatus: { type: Sequelize.STRING(30), allowNull: false },
      effectiveAt: { type: Sequelize.DATE, allowNull: false },
      reason: { type: Sequelize.STRING(500), allowNull: true },
      actorUserId: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('employee_dependents', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      employeeId: { type: Sequelize.UUID, allowNull: false },
      fullName: { type: Sequelize.STRING(200), allowNull: false },
      relationship: { type: Sequelize.STRING(80), allowNull: false },
      dateOfBirth: { type: Sequelize.DATEONLY, allowNull: true },
      fiscalDependent: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('employee_bank_accounts', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      employeeId: { type: Sequelize.UUID, allowNull: false },
      bankName: { type: Sequelize.STRING(120), allowNull: false },
      accountName: { type: Sequelize.STRING(150), allowNull: false },
      accountNumber: { type: Sequelize.STRING(50), allowNull: false },
      iban: { type: Sequelize.STRING(34), allowNull: true },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'AOA' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex(
      'employee_professional_history',
      ['companyId', 'employeeId', 'effectiveFrom'],
      { name: 'idx_employee_professional_period' },
    );
    await queryInterface.addIndex(
      'employee_status_history',
      ['companyId', 'employeeId', 'effectiveAt'],
      { name: 'idx_employee_status_period' },
    );
    await queryInterface.addIndex('employee_dependents', ['companyId', 'employeeId'], {
      name: 'idx_employee_dependents_employee',
    });
    await queryInterface.addIndex('employee_bank_accounts', ['companyId', 'employeeId'], {
      unique: true,
      name: 'uq_employee_bank_employee',
    });

    if (queryInterface.sequelize.getDialect() === 'postgres') {
      for (const table of [
        'employees',
        'employee_professional_history',
        'employee_status_history',
        'employee_dependents',
        'employee_bank_accounts',
      ]) {
        const policy = `${table}_tenant_isolation`;
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
        await queryInterface.sequelize.query(
          `CREATE POLICY "${policy}" ON "${table}"
             USING ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)
             WITH CHECK ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)`,
        );
      }

      await queryInterface.sequelize.query(
        `ALTER TABLE "employee_professional_history"
           ADD CONSTRAINT "fk_employee_professional_tenant_employee"
           FOREIGN KEY ("companyId", "employeeId")
           REFERENCES "employees" ("companyId", "id")
           ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "employee_status_history"
           ADD CONSTRAINT "fk_employee_status_tenant_employee"
           FOREIGN KEY ("companyId", "employeeId")
           REFERENCES "employees" ("companyId", "id")
           ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "employee_dependents"
           ADD CONSTRAINT "fk_employee_dependent_tenant_employee"
           FOREIGN KEY ("companyId", "employeeId")
           REFERENCES "employees" ("companyId", "id")
           ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "employee_bank_accounts"
           ADD CONSTRAINT "fk_employee_bank_tenant_employee"
           FOREIGN KEY ("companyId", "employeeId")
           REFERENCES "employees" ("companyId", "id")
           ON DELETE CASCADE ON UPDATE CASCADE`,
      );
    }
  },

  async down(queryInterface) {
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      for (const table of [
        'employee_bank_accounts',
        'employee_dependents',
        'employee_professional_history',
        'employee_status_history',
        'employees',
      ]) {
        await queryInterface.sequelize.query(
          `DROP POLICY IF EXISTS "${table}_tenant_isolation" ON "${table}"`,
        );
      }
    }
    await queryInterface.dropTable('employee_bank_accounts');
    await queryInterface.dropTable('employee_dependents');
    await queryInterface.dropTable('employee_status_history');
    await queryInterface.dropTable('employee_professional_history');
    await queryInterface.dropTable('employees');
  },
};
