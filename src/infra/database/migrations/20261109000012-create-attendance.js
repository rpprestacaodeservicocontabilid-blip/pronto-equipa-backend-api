'use strict';

const tenantTables = ['attendance_records', 'attendance_entities', 'attendance_outbox'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('attendance_records', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      employeeId: { type: Sequelize.UUID, allowNull: false },
      punchType: { type: Sequelize.STRING(20), allowNull: false },
      occurredAt: { type: Sequelize.DATE, allowNull: false },
      workDate: { type: Sequelize.DATEONLY, allowNull: false },
      timezone: { type: Sequelize.STRING(80), allowNull: false },
      source: { type: Sequelize.STRING(30), allowNull: false },
      externalReference: { type: Sequelize.STRING(200), allowNull: true },
      idempotencyKey: { type: Sequelize.STRING(200), allowNull: true },
      deviceId: { type: Sequelize.STRING(200), allowNull: true },
      correctionOfId: { type: Sequelize.UUID, allowNull: true },
      metadata: { type: Sequelize.JSON, allowNull: false },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('attendance_records', ['companyId', 'id'], {
      unique: true,
      name: 'uq_att_record_company_id',
    });
    await queryInterface.addIndex(
      'attendance_records',
      ['companyId', 'employeeId', 'workDate', 'occurredAt'],
      { name: 'idx_att_record_employee_date' },
    );
    await queryInterface.addIndex('attendance_records', ['companyId', 'source', 'idempotencyKey'], {
      unique: true,
      name: 'uq_att_record_idempotency',
    });
    await queryInterface.addIndex(
      'attendance_records',
      ['companyId', 'source', 'externalReference'],
      { unique: true, name: 'uq_att_record_external_ref' },
    );

    await queryInterface.createTable('attendance_entities', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: { type: Sequelize.STRING(30), allowNull: false },
      employeeId: { type: Sequelize.UUID, allowNull: true },
      parentId: { type: Sequelize.UUID, allowNull: true },
      workDate: { type: Sequelize.DATEONLY, allowNull: true },
      periodStart: { type: Sequelize.DATEONLY, allowNull: true },
      periodEnd: { type: Sequelize.DATEONLY, allowNull: true },
      status: { type: Sequelize.STRING(30), allowNull: false },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      idempotencyKey: { type: Sequelize.STRING(200), allowNull: true },
      uniqueDayKey: { type: Sequelize.STRING(200), allowNull: true },
      data: { type: Sequelize.JSON, allowNull: false },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('attendance_entities', ['companyId', 'id'], {
      unique: true,
      name: 'uq_att_entity_company_id',
    });
    await queryInterface.addIndex(
      'attendance_entities',
      ['companyId', 'type', 'employeeId', 'workDate'],
      { name: 'idx_att_entity_employee_date' },
    );
    await queryInterface.addIndex('attendance_entities', ['companyId', 'type', 'status'], {
      name: 'idx_att_entity_status',
    });
    await queryInterface.addIndex('attendance_entities', ['companyId', 'type', 'idempotencyKey'], {
      unique: true,
      name: 'uq_att_entity_idempotency',
    });
    await queryInterface.addIndex('attendance_entities', ['companyId', 'type', 'uniqueDayKey'], {
      unique: true,
      name: 'uq_attendance_day',
    });

    await queryInterface.createTable('attendance_outbox', {
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
    await queryInterface.addIndex('attendance_outbox', ['publishedAt', 'occurredAt'], {
      name: 'idx_att_outbox_pending',
    });

    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query(
        'ALTER TABLE "attendance_records" ADD CONSTRAINT "fk_att_record_employee_tenant" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees" ("companyId", "id") ON DELETE RESTRICT',
      );
      await queryInterface.sequelize.query(
        'ALTER TABLE "attendance_records" ADD CONSTRAINT "fk_att_record_correction_tenant" FOREIGN KEY ("companyId", "correctionOfId") REFERENCES "attendance_records" ("companyId", "id") ON DELETE RESTRICT',
      );
      await queryInterface.sequelize.query(
        'ALTER TABLE "attendance_entities" ADD CONSTRAINT "fk_att_entity_employee_tenant" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees" ("companyId", "id") ON DELETE RESTRICT',
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "attendance_records" ADD CONSTRAINT "ck_att_punch_type" CHECK ("punchType" IN ('IN', 'OUT', 'BREAK_START', 'BREAK_END'))`,
      );
      for (const table of tenantTables) {
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
      for (const table of tenantTables) {
        await queryInterface.sequelize.query(
          `DROP POLICY IF EXISTS "${table}_tenant_isolation" ON "${table}"`,
        );
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`);
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
      }
    }
    for (const table of [...tenantTables].reverse()) await queryInterface.dropTable(table);
  },
};
