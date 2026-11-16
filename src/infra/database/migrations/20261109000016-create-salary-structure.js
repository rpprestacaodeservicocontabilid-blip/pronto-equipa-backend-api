'use strict';

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

const tenant = (Sequelize) => ({
  type: Sequelize.INTEGER.UNSIGNED,
  allowNull: false,
  references: { model: 'companies', key: 'id' },
  onDelete: 'CASCADE',
});

module.exports = {
  async up(queryInterface, Sequelize) {
    const uuid = { type: Sequelize.UUID, allowNull: false };
    const amount = { type: Sequelize.DECIMAL(18, 2), allowNull: false };
    const date = { type: Sequelize.DATEONLY, allowNull: false };
    const time = { type: Sequelize.DATE, allowNull: false };

    await queryInterface.createTable('salary_components', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      code: { type: Sequelize.STRING(50), allowNull: false },
      name: { type: Sequelize.STRING(150), allowNull: false },
      description: { type: Sequelize.STRING(1000), allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      createdAt: time,
      updatedAt: time,
    });
    await queryInterface.addIndex('salary_components', ['companyId', 'code'], {
      unique: true,
      name: 'uq_salary_component_code',
    });
    await queryInterface.addIndex('salary_components', ['companyId', 'id'], {
      unique: true,
      name: 'uq_salary_component_tenant_id',
    });

    await queryInterface.createTable('salary_component_versions', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      componentId: uuid,
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      componentType: { type: Sequelize.STRING(40), allowNull: false },
      calculationMethod: { type: Sequelize.STRING(40), allowNull: false },
      frequency: { type: Sequelize.STRING(30), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false },
      legalClassificationRef: { type: Sequelize.STRING(120), allowNull: true },
      effectiveFrom: date,
      effectiveTo: { type: Sequelize.DATEONLY, allowNull: true },
      calculationConfig: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'DRAFT' },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      createdAt: time,
    });
    await queryInterface.addIndex(
      'salary_component_versions',
      ['companyId', 'componentId', 'version'],
      { unique: true, name: 'uq_salary_component_version' },
    );
    await queryInterface.addIndex('salary_component_versions', ['companyId', 'id'], {
      unique: true,
      name: 'uq_salary_component_version_tenant_id',
    });

    await queryInterface.createTable('salary_tables', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      code: { type: Sequelize.STRING(50), allowNull: false },
      name: { type: Sequelize.STRING(150), allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      createdAt: time,
      updatedAt: time,
    });
    await queryInterface.addIndex('salary_tables', ['companyId', 'code'], {
      unique: true,
      name: 'uq_salary_table_code',
    });
    await queryInterface.addIndex('salary_tables', ['companyId', 'id'], {
      unique: true,
      name: 'uq_salary_table_tenant_id',
    });

    await queryInterface.createTable('salary_table_versions', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      tableId: uuid,
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      effectiveFrom: date,
      effectiveTo: { type: Sequelize.DATEONLY, allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'DRAFT' },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      createdAt: time,
    });
    await queryInterface.addIndex('salary_table_versions', ['companyId', 'tableId', 'version'], {
      unique: true,
      name: 'uq_salary_table_version',
    });
    await queryInterface.addIndex('salary_table_versions', ['companyId', 'id'], {
      unique: true,
      name: 'uq_salary_table_version_tenant_id',
    });

    await queryInterface.createTable('salary_grades', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      tableVersionId: uuid,
      code: { type: Sequelize.STRING(50), allowNull: false },
      name: { type: Sequelize.STRING(150), allowNull: false },
      minAmount: amount,
      maxAmount: amount,
      currency: { type: Sequelize.STRING(3), allowNull: false },
      functionCode: { type: Sequelize.STRING(100), allowNull: true },
      categoryCode: { type: Sequelize.STRING(100), allowNull: true },
      createdAt: time,
    });
    await queryInterface.addIndex('salary_grades', ['companyId', 'tableVersionId', 'code'], {
      unique: true,
      name: 'uq_salary_grade_code',
    });
    await queryInterface.addIndex('salary_grades', ['companyId', 'id'], {
      unique: true,
      name: 'uq_salary_grade_tenant_id',
    });

    await queryInterface.createTable('salary_steps', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      gradeId: uuid,
      code: { type: Sequelize.STRING(50), allowNull: false },
      name: { type: Sequelize.STRING(150), allowNull: false },
      amount,
      currency: { type: Sequelize.STRING(3), allowNull: false },
      createdAt: time,
    });
    await queryInterface.addIndex('salary_steps', ['companyId', 'gradeId', 'code'], {
      unique: true,
      name: 'uq_salary_step_code',
    });
    await queryInterface.addIndex('salary_steps', ['companyId', 'id'], {
      unique: true,
      name: 'uq_salary_step_tenant_id',
    });

    await queryInterface.createTable('salary_structures', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      code: { type: Sequelize.STRING(50), allowNull: false },
      name: { type: Sequelize.STRING(150), allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      createdAt: time,
      updatedAt: time,
    });
    await queryInterface.addIndex('salary_structures', ['companyId', 'code'], {
      unique: true,
      name: 'uq_salary_structure_code',
    });
    await queryInterface.addIndex('salary_structures', ['companyId', 'id'], {
      unique: true,
      name: 'uq_salary_structure_tenant_id',
    });

    await queryInterface.createTable('salary_structure_versions', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      structureId: uuid,
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      effectiveFrom: date,
      effectiveTo: { type: Sequelize.DATEONLY, allowNull: true },
      status: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'DRAFT' },
      approvedBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      approvedAt: { type: Sequelize.DATE, allowNull: true },
      publishedAt: { type: Sequelize.DATE, allowNull: true },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      createdAt: time,
    });
    await queryInterface.addIndex(
      'salary_structure_versions',
      ['companyId', 'structureId', 'version'],
      { unique: true, name: 'uq_salary_structure_version' },
    );
    await queryInterface.addIndex('salary_structure_versions', ['companyId', 'id'], {
      unique: true,
      name: 'uq_salary_structure_version_tenant_id',
    });

    await queryInterface.createTable('salary_structure_items', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      structureVersionId: uuid,
      componentVersionId: uuid,
      amount: { type: Sequelize.DECIMAL(18, 2), allowNull: true },
      percentage: { type: Sequelize.DECIMAL(7, 4), allowNull: true },
      calculationConfig: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
      required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: time,
    });
    await queryInterface.addIndex(
      'salary_structure_items',
      ['companyId', 'structureVersionId', 'componentVersionId'],
      { unique: true, name: 'uq_salary_structure_item' },
    );

    await queryInterface.createTable('employee_salary_assignments', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      employeeId: uuid,
      contractId: uuid,
      structureVersionId: { type: Sequelize.UUID, allowNull: true },
      effectiveFrom: date,
      effectiveTo: { type: Sequelize.DATEONLY, allowNull: true },
      baseSalary: amount,
      currency: { type: Sequelize.STRING(3), allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      sourceRevisionId: { type: Sequelize.UUID, allowNull: true },
      createdAt: time,
      updatedAt: time,
    });
    await queryInterface.addIndex('employee_salary_assignments', ['companyId', 'id'], {
      unique: true,
      name: 'uq_salary_assignment_tenant_id',
    });
    await queryInterface.addIndex(
      'employee_salary_assignments',
      ['companyId', 'employeeId', 'effectiveFrom', 'effectiveTo'],
      { name: 'idx_salary_assignment_effective' },
    );

    await queryInterface.createTable('employee_salary_components', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      assignmentId: uuid,
      componentVersionId: uuid,
      amount: { type: Sequelize.DECIMAL(18, 2), allowNull: true },
      calculationConfig: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
      sourceReference: { type: Sequelize.STRING(200), allowNull: true },
      createdAt: time,
    });
    await queryInterface.addIndex(
      'employee_salary_components',
      ['companyId', 'assignmentId', 'componentVersionId'],
      { unique: true, name: 'uq_salary_assignment_component' },
    );

    await queryInterface.createTable('salary_revisions', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      employeeId: uuid,
      previousAssignmentId: uuid,
      proposedData: { type: Sequelize.JSON, allowNull: false },
      effectiveFrom: date,
      status: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'DRAFT' },
      reason: { type: Sequelize.STRING(2000), allowNull: false },
      requestedBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      decidedBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      decidedAt: { type: Sequelize.DATE, allowNull: true },
      appliedAssignmentId: { type: Sequelize.UUID, allowNull: true },
      idempotencyKey: { type: Sequelize.STRING(200), allowNull: true },
      createdAt: time,
      updatedAt: time,
    });
    await queryInterface.addIndex('salary_revisions', ['companyId', 'employeeId', 'status'], {
      name: 'idx_salary_revision_status',
    });
    await queryInterface.addIndex('salary_revisions', ['companyId', 'idempotencyKey'], {
      unique: true,
      name: 'uq_salary_revision_idempotency',
    });

    await queryInterface.createTable('salary_revision_batches', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      code: { type: Sequelize.STRING(50), allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'DRAFT' },
      effectiveFrom: date,
      reason: { type: Sequelize.STRING(2000), allowNull: false },
      requestedBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      idempotencyKey: { type: Sequelize.STRING(200), allowNull: false },
      approvedBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      approvedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: time,
      updatedAt: time,
    });
    await queryInterface.addIndex('salary_revision_batches', ['companyId', 'code'], {
      unique: true,
      name: 'uq_salary_revision_batch_code',
    });
    await queryInterface.addIndex('salary_revision_batches', ['companyId', 'idempotencyKey'], {
      unique: true,
      name: 'uq_salary_revision_batch_idempotency',
    });
    await queryInterface.addIndex('salary_revision_batches', ['companyId', 'id'], {
      unique: true,
      name: 'uq_salary_revision_batch_tenant_id',
    });

    await queryInterface.createTable('salary_revision_items', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      batchId: uuid,
      employeeId: uuid,
      previousAssignmentId: { type: Sequelize.UUID, allowNull: true },
      proposedData: { type: Sequelize.JSON, allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'PENDING' },
      error: { type: Sequelize.STRING(1000), allowNull: true },
      assignmentId: { type: Sequelize.UUID, allowNull: true },
      createdAt: time,
    });
    await queryInterface.addIndex('salary_revision_items', ['companyId', 'batchId', 'employeeId'], {
      unique: true,
      name: 'uq_salary_revision_batch_employee',
    });

    await queryInterface.createTable('salary_policies', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      code: { type: Sequelize.STRING(50), allowNull: false },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      effectiveFrom: date,
      effectiveTo: { type: Sequelize.DATEONLY, allowNull: true },
      rules: { type: Sequelize.JSON, allowNull: false },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      createdAt: time,
    });
    await queryInterface.addIndex('salary_policies', ['companyId', 'code', 'version'], {
      unique: true,
      name: 'uq_salary_policy_version',
    });

    await queryInterface.createTable('salary_snapshots', {
      id: { ...uuid, primaryKey: true },
      companyId: tenant(Sequelize),
      employeeId: uuid,
      effectiveDate: date,
      assignmentId: uuid,
      sourceVersions: { type: Sequelize.JSON, allowNull: false },
      resolvedComponents: { type: Sequelize.JSON, allowNull: false },
      createdAt: time,
    });
    await queryInterface.addIndex(
      'salary_snapshots',
      ['companyId', 'employeeId', 'effectiveDate', 'assignmentId'],
      { unique: true, name: 'uq_salary_snapshot_effective' },
    );

    await queryInterface.createTable('salary_structure_outbox', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      companyId: tenant(Sequelize),
      aggregateId: uuid,
      eventType: { type: Sequelize.STRING(100), allowNull: false },
      payload: { type: Sequelize.JSON, allowNull: false },
      occurredAt: time,
      publishedAt: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('salary_structure_outbox', ['publishedAt', 'occurredAt'], {
      name: 'idx_salary_outbox_pending',
    });

    if (queryInterface.sequelize.getDialect() === 'postgres') {
      const compositeKeys = [
        ['salary_component_versions', 'componentId', 'salary_components'],
        ['salary_table_versions', 'tableId', 'salary_tables'],
        ['salary_grades', 'tableVersionId', 'salary_table_versions'],
        ['salary_steps', 'gradeId', 'salary_grades'],
        ['salary_structure_versions', 'structureId', 'salary_structures'],
        ['salary_structure_items', 'structureVersionId', 'salary_structure_versions'],
        ['salary_structure_items', 'componentVersionId', 'salary_component_versions'],
        ['employee_salary_assignments', 'employeeId', 'employees'],
        ['employee_salary_assignments', 'contractId', 'employment_contracts'],
        ['employee_salary_assignments', 'structureVersionId', 'salary_structure_versions'],
        ['employee_salary_components', 'assignmentId', 'employee_salary_assignments'],
        ['employee_salary_components', 'componentVersionId', 'salary_component_versions'],
        ['salary_revisions', 'employeeId', 'employees'],
        ['salary_revisions', 'previousAssignmentId', 'employee_salary_assignments'],
        ['salary_revisions', 'appliedAssignmentId', 'employee_salary_assignments'],
        ['salary_revision_items', 'batchId', 'salary_revision_batches'],
        ['salary_revision_items', 'employeeId', 'employees'],
        ['salary_revision_items', 'previousAssignmentId', 'employee_salary_assignments'],
        ['salary_revision_items', 'assignmentId', 'employee_salary_assignments'],
        ['salary_snapshots', 'employeeId', 'employees'],
        ['salary_snapshots', 'assignmentId', 'employee_salary_assignments'],
      ];
      for (const [source, field, target] of compositeKeys) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${source}" ADD CONSTRAINT "fk_${source}_${field}_tenant"
           FOREIGN KEY ("companyId", "${field}") REFERENCES "${target}" ("companyId", "id") ON DELETE RESTRICT`,
        );
      }
      await queryInterface.sequelize.query(
        `CREATE FUNCTION prevent_salary_snapshot_mutation() RETURNS trigger AS $$
         BEGIN RAISE EXCEPTION 'Salary snapshots are immutable'; END;
         $$ LANGUAGE plpgsql`,
      );
      await queryInterface.sequelize.query(
        `CREATE TRIGGER salary_snapshot_immutable BEFORE UPDATE OR DELETE ON "salary_snapshots"
         FOR EACH ROW EXECUTE FUNCTION prevent_salary_snapshot_mutation()`,
      );
      for (const table of tables) {
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
      await queryInterface.sequelize.query(
        'DROP TRIGGER IF EXISTS salary_snapshot_immutable ON "salary_snapshots"',
      );
      await queryInterface.sequelize.query(
        'DROP FUNCTION IF EXISTS prevent_salary_snapshot_mutation()',
      );
      for (const table of tables) {
        await queryInterface.sequelize.query(
          `DROP POLICY IF EXISTS "${table}_tenant_isolation" ON "${table}"`,
        );
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`);
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
      }
    }
    for (const table of tables) await queryInterface.dropTable(table);
  },
};
