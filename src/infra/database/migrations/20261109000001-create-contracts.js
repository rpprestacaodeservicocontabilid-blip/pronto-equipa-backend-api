'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('contract_types', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      code: { type: Sequelize.STRING(50), allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      legalRuleVersionId: { type: Sequelize.STRING(120), allowNull: true },
      requiresEndDate: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      maxRenewals: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('contract_types', ['companyId', 'code'], {
      unique: true,
      name: 'uq_contract_type_company_code',
    });

    await queryInterface.createTable('employment_contracts', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      employeeId: { type: Sequelize.UUID, allowNull: false },
      contractNumber: { type: Sequelize.STRING(50), allowNull: false },
      typeCode: { type: Sequelize.STRING(50), allowNull: false },
      legalRuleVersionId: { type: Sequelize.STRING(120), allowNull: true },
      status: { type: Sequelize.STRING(30), allowNull: false },
      startDate: { type: Sequelize.DATEONLY, allowNull: false },
      endDate: { type: Sequelize.DATEONLY, allowNull: true },
      currency: { type: Sequelize.STRING(3), allowNull: false },
      salaryAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
      terms: { type: Sequelize.JSON, allowNull: false },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('employment_contracts', ['companyId', 'contractNumber'], {
      unique: true,
      name: 'uq_contract_company_number',
    });
    await queryInterface.addIndex('employment_contracts', ['companyId', 'employeeId', 'status'], {
      name: 'idx_contract_employee_status',
    });
    await queryInterface.addIndex('employment_contracts', ['companyId', 'status', 'endDate'], {
      name: 'idx_contract_expiring',
    });
    await queryInterface.addIndex('employment_contracts', ['companyId', 'id'], {
      unique: true,
      name: 'uq_contract_company_id',
    });

    await queryInterface.createTable('contract_records', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      contractId: { type: Sequelize.UUID, allowNull: false },
      type: { type: Sequelize.STRING(40), allowNull: false },
      actorUserId: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      payload: { type: Sequelize.JSON, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('contract_records', ['companyId', 'contractId', 'createdAt'], {
      name: 'idx_contract_record_history',
    });

    await queryInterface.createTable('contract_outbox', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      aggregateId: { type: Sequelize.UUID, allowNull: false },
      eventType: { type: Sequelize.STRING(80), allowNull: false },
      payload: { type: Sequelize.JSON, allowNull: false },
      occurredAt: { type: Sequelize.DATE, allowNull: false },
      publishedAt: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('contract_outbox', ['publishedAt', 'occurredAt'], {
      name: 'idx_contract_outbox_pending',
    });

    await queryInterface.createTable('contract_alerts', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      contractId: { type: Sequelize.UUID, allowNull: false },
      alertType: { type: Sequelize.STRING(30), allowNull: false },
      scheduledAt: { type: Sequelize.DATE, allowNull: false },
      sentAt: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('contract_alerts', ['companyId', 'contractId', 'alertType'], {
      unique: true,
      name: 'uq_contract_alert_once',
    });
    await queryInterface.addIndex('contract_alerts', ['companyId', 'scheduledAt', 'sentAt'], {
      name: 'idx_contract_alert_pending',
    });

    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query(
        `ALTER TABLE "employment_contracts"
         ADD CONSTRAINT "fk_contract_tenant_employee"
         FOREIGN KEY ("companyId", "employeeId")
         REFERENCES "employees" ("companyId", "id")
         ON DELETE RESTRICT ON UPDATE CASCADE`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "contract_records"
         ADD CONSTRAINT "fk_contract_record_tenant_contract"
         FOREIGN KEY ("companyId", "contractId")
         REFERENCES "employment_contracts" ("companyId", "id")
         ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "contract_outbox"
         ADD CONSTRAINT "fk_contract_outbox_tenant_contract"
         FOREIGN KEY ("companyId", "aggregateId")
         REFERENCES "employment_contracts" ("companyId", "id")
         ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "contract_alerts"
         ADD CONSTRAINT "fk_contract_alert_tenant_contract"
         FOREIGN KEY ("companyId", "contractId")
         REFERENCES "employment_contracts" ("companyId", "id")
         ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "employment_contracts"
         ADD CONSTRAINT "ck_contract_period"
         CHECK ("endDate" IS NULL OR "endDate" > "startDate")`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "employment_contracts"
         ADD CONSTRAINT "ck_contract_status"
         CHECK ("status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','SUSPENDED','EXPIRED','TERMINATED','REJECTED','CANCELLED'))`,
      );
      for (const table of [
        'employment_contracts',
        'contract_records',
        'contract_outbox',
        'contract_alerts',
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
        `ALTER TABLE "contract_types" ENABLE ROW LEVEL SECURITY`,
      );
      await queryInterface.sequelize.query(
        `CREATE POLICY "contract_types_tenant_isolation" ON "contract_types"
         USING ("companyId" IS NULL OR "companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)
         WITH CHECK ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)`,
      );
    }
  },

  async down(queryInterface) {
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      for (const table of [
        'employment_contracts',
        'contract_records',
        'contract_outbox',
        'contract_alerts',
        'contract_types',
      ]) {
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
      }
    }
    await queryInterface.dropTable('contract_alerts');
    await queryInterface.dropTable('contract_outbox');
    await queryInterface.dropTable('contract_records');
    await queryInterface.dropTable('employment_contracts');
    await queryInterface.dropTable('contract_types');
  },
};
