'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('organization_records', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: { type: Sequelize.STRING(40), allowNull: false },
      code: { type: Sequelize.STRING(50), allowNull: false },
      name: { type: Sequelize.STRING(150), allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false },
      parentId: { type: Sequelize.UUID, allowNull: true },
      effectiveFrom: { type: Sequelize.DATEONLY, allowNull: true },
      effectiveTo: { type: Sequelize.DATEONLY, allowNull: true },
      employeeId: { type: Sequelize.UUID, allowNull: true },
      relatedId: { type: Sequelize.UUID, allowNull: true },
      percentage: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      data: { type: Sequelize.JSON, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('organization_records', ['companyId', 'type', 'code'], {
      unique: true,
      name: 'uq_org_company_type_code',
    });
    await queryInterface.addIndex('organization_records', ['companyId', 'type', 'status'], {
      name: 'idx_org_company_type_status',
    });
    await queryInterface.addIndex('organization_records', ['companyId', 'type', 'parentId'], {
      name: 'idx_org_company_parent',
    });
    await queryInterface.addIndex(
      'organization_records',
      ['companyId', 'employeeId', 'effectiveFrom', 'effectiveTo'],
      { name: 'idx_org_employee_allocation_period' },
    );
    await queryInterface.addIndex('organization_records', ['companyId', 'id'], {
      unique: true,
      name: 'uq_org_company_id',
    });

    await queryInterface.createTable('organization_structure_history', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      entityId: { type: Sequelize.UUID, allowNull: false },
      entityType: { type: Sequelize.STRING(40), allowNull: false },
      changeType: { type: Sequelize.STRING(40), allowNull: false },
      actorUserId: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      previousData: { type: Sequelize.JSON, allowNull: true },
      newData: { type: Sequelize.JSON, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex(
      'organization_structure_history',
      ['companyId', 'entityType', 'entityId', 'createdAt'],
      { name: 'idx_org_history_entity' },
    );

    await queryInterface.createTable('organization_outbox', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      aggregateId: { type: Sequelize.UUID, allowNull: false },
      eventType: { type: Sequelize.STRING(100), allowNull: false },
      payload: { type: Sequelize.JSON, allowNull: false },
      occurredAt: { type: Sequelize.DATE, allowNull: false },
      publishedAt: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('organization_outbox', ['publishedAt', 'occurredAt'], {
      name: 'idx_org_outbox_pending',
    });

    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query(
        `ALTER TABLE "organization_records"
         ADD CONSTRAINT "fk_org_record_parent_tenant"
         FOREIGN KEY ("companyId", "parentId")
         REFERENCES "organization_records" ("companyId", "id")
         ON DELETE RESTRICT ON UPDATE CASCADE`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "organization_records"
         ADD CONSTRAINT "fk_org_record_related_tenant"
         FOREIGN KEY ("companyId", "relatedId")
         REFERENCES "organization_records" ("companyId", "id")
         ON DELETE RESTRICT ON UPDATE CASCADE`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "organization_records"
         ADD CONSTRAINT "fk_org_record_employee_tenant"
         FOREIGN KEY ("companyId", "employeeId")
         REFERENCES "employees" ("companyId", "id")
         ON DELETE RESTRICT ON UPDATE CASCADE`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "organization_structure_history"
         ADD CONSTRAINT "fk_org_history_record_tenant"
         FOREIGN KEY ("companyId", "entityId")
         REFERENCES "organization_records" ("companyId", "id")
         ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "organization_outbox"
         ADD CONSTRAINT "fk_org_outbox_record_tenant"
         FOREIGN KEY ("companyId", "aggregateId")
         REFERENCES "organization_records" ("companyId", "id")
         ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "organization_records"
         ADD CONSTRAINT "ck_org_record_status" CHECK ("status" IN ('ACTIVE', 'INACTIVE'))`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "organization_records"
         ADD CONSTRAINT "ck_org_effective_period"
         CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom")`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "organization_records"
         ADD CONSTRAINT "ck_org_allocation_percentage"
         CHECK ("percentage" IS NULL OR ("percentage" > 0 AND "percentage" <= 100))`,
      );
      for (const table of [
        'organization_records',
        'organization_structure_history',
        'organization_outbox',
      ]) {
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
        await queryInterface.sequelize.query(
          `CREATE POLICY "${table}_tenant_isolation" ON "${table}"
           USING ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)
           WITH CHECK ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)`,
        );
      }
    }
  },

  async down(queryInterface) {
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      for (const table of [
        'organization_records',
        'organization_structure_history',
        'organization_outbox',
      ]) {
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
      }
    }
    await queryInterface.dropTable('organization_outbox');
    await queryInterface.dropTable('organization_structure_history');
    await queryInterface.dropTable('organization_records');
  },
};
