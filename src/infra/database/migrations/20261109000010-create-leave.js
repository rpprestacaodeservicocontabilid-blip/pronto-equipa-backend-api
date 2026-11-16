'use strict';

/**
 * Leave (férias): contas, direitos, ledger de saldo, pedidos,
 * segmentos, decisões, interrupções e outbox transaccional.
 * PostgreSQL RLS supplements (never replaces) tenant-scoped
 * repository queries.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ----------------------------------------------------------
    // leave_accounts — conta de férias por (empresa, trabalhador)
    // ----------------------------------------------------------
    await queryInterface.createTable('leave_accounts', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      employeeId: { type: Sequelize.UUID, allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('leave_accounts', ['companyId', 'employeeId'], {
      unique: true,
      name: 'uq_leave_account_employee',
    });
    await queryInterface.addIndex('leave_accounts', ['companyId', 'status'], {
      name: 'idx_leave_account_company_status',
    });
    await queryInterface.addIndex('leave_accounts', ['companyId', 'id'], {
      unique: true,
      name: 'uq_leave_account_company_id',
    });

    // ----------------------------------------------------------
    // leave_entitlements — direito adquirido por período
    // ----------------------------------------------------------
    await queryInterface.createTable('leave_entitlements', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      accountId: { type: Sequelize.UUID, allowNull: false },
      accrualPeriodStart: { type: Sequelize.DATEONLY, allowNull: false },
      accrualPeriodEnd: { type: Sequelize.DATEONLY, allowNull: false },
      days: { type: Sequelize.INTEGER, allowNull: false },
      legalRuleVersionId: { type: Sequelize.STRING(120), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex(
      'leave_entitlements',
      ['companyId', 'accountId', 'accrualPeriodStart', 'accrualPeriodEnd'],
      { unique: true, name: 'uq_leave_entitlement_period' },
    );
    await queryInterface.addIndex('leave_entitlements', ['companyId', 'accountId'], {
      name: 'idx_leave_entitlement_account',
    });
    await queryInterface.addIndex('leave_entitlements', ['companyId', 'id'], {
      unique: true,
      name: 'uq_leave_entitlement_company_id',
    });

    // ----------------------------------------------------------
    // leave_balance_movements — ledger imutável (sem updatedAt)
    // ----------------------------------------------------------
    await queryInterface.createTable('leave_balance_movements', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      accountId: { type: Sequelize.UUID, allowNull: false },
      entitlementId: { type: Sequelize.UUID, allowNull: true },
      movementType: { type: Sequelize.STRING(20), allowNull: false },
      days: { type: Sequelize.INTEGER, allowNull: false },
      referenceId: { type: Sequelize.UUID, allowNull: true },
      reason: { type: Sequelize.STRING(500), allowNull: true },
      actorUserId: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex(
      'leave_balance_movements',
      ['companyId', 'accountId', 'createdAt'],
      {
        name: 'idx_leave_movement_account',
      },
    );
    await queryInterface.addIndex('leave_balance_movements', ['companyId', 'movementType'], {
      name: 'idx_leave_movement_type',
    });
    await queryInterface.addIndex('leave_balance_movements', ['companyId', 'referenceId'], {
      name: 'idx_leave_movement_reference',
    });

    // ----------------------------------------------------------
    // leave_requests — ciclo de vida do pedido
    // ----------------------------------------------------------
    await queryInterface.createTable('leave_requests', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      employeeId: { type: Sequelize.UUID, allowNull: false },
      accountId: { type: Sequelize.UUID, allowNull: false },
      leaveType: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'ANNUAL' },
      status: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'DRAFT' },
      reason: { type: Sequelize.STRING(1000), allowNull: true },
      requestedDays: { type: Sequelize.INTEGER, allowNull: false },
      startDate: { type: Sequelize.DATEONLY, allowNull: false },
      endDate: { type: Sequelize.DATEONLY, allowNull: false },
      submittedAt: { type: Sequelize.DATE, allowNull: true },
      decidedAt: { type: Sequelize.DATE, allowNull: true },
      createdByUserId: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('leave_requests', ['companyId', 'employeeId', 'startDate'], {
      name: 'idx_leave_request_employee',
    });
    await queryInterface.addIndex('leave_requests', ['companyId', 'status'], {
      name: 'idx_leave_request_status',
    });
    await queryInterface.addIndex('leave_requests', ['companyId', 'startDate', 'endDate'], {
      name: 'idx_leave_request_period',
    });
    await queryInterface.addIndex('leave_requests', ['companyId', 'id'], {
      unique: true,
      name: 'uq_leave_request_company_id',
    });

    // ----------------------------------------------------------
    // leave_request_periods — segmentos com dias calculados
    // ----------------------------------------------------------
    await queryInterface.createTable('leave_request_periods', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      requestId: { type: Sequelize.UUID, allowNull: false },
      startDate: { type: Sequelize.DATEONLY, allowNull: false },
      endDate: { type: Sequelize.DATEONLY, allowNull: false },
      calculatedDays: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('leave_request_periods', ['companyId', 'requestId'], {
      name: 'idx_leave_period_request',
    });
    await queryInterface.addIndex('leave_request_periods', ['companyId', 'startDate', 'endDate'], {
      name: 'idx_leave_period_range',
    });

    // ----------------------------------------------------------
    // leave_approvals — decisões imutáveis
    // ----------------------------------------------------------
    await queryInterface.createTable('leave_approvals', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      requestId: { type: Sequelize.UUID, allowNull: false },
      approverUserId: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      decision: { type: Sequelize.STRING(20), allowNull: false },
      comments: { type: Sequelize.STRING(1000), allowNull: true },
      decidedAt: { type: Sequelize.DATE, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('leave_approvals', ['companyId', 'requestId', 'decidedAt'], {
      name: 'idx_leave_approval_request',
    });

    // ----------------------------------------------------------
    // leave_interruptions — interrupções autorizadas
    // ----------------------------------------------------------
    await queryInterface.createTable('leave_interruptions', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      requestId: { type: Sequelize.UUID, allowNull: false },
      startDate: { type: Sequelize.DATEONLY, allowNull: false },
      endDate: { type: Sequelize.DATEONLY, allowNull: false },
      reason: { type: Sequelize.STRING(500), allowNull: false },
      actorUserId: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('leave_interruptions', ['companyId', 'requestId'], {
      name: 'idx_leave_interruption_request',
    });
    await queryInterface.addIndex('leave_interruptions', ['companyId', 'startDate', 'endDate'], {
      name: 'idx_leave_interruption_range',
    });

    // ----------------------------------------------------------
    // leave_outbox — outbox transaccional (publishedAt: null)
    // ----------------------------------------------------------
    await queryInterface.createTable('leave_outbox', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      aggregateId: { type: Sequelize.UUID, allowNull: false },
      eventType: { type: Sequelize.STRING(80), allowNull: false },
      payload: { type: Sequelize.JSON, allowNull: false },
      occurredAt: { type: Sequelize.DATE, allowNull: false },
      publishedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('leave_outbox', ['publishedAt', 'occurredAt'], {
      name: 'idx_leave_outbox_pending',
    });

    // ----------------------------------------------------------
    // FK compostas (tenant), CHECKs e RLS — apenas PostgreSQL
    // ----------------------------------------------------------
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      const compositeFks = [
        [
          'leave_accounts',
          'fk_leave_account_tenant_employee',
          'employees',
          ['companyId', 'employeeId'],
          ['companyId', 'id'],
        ],
        [
          'leave_entitlements',
          'fk_leave_entitlement_tenant_account',
          'leave_accounts',
          ['companyId', 'accountId'],
          ['companyId', 'id'],
        ],
        [
          'leave_balance_movements',
          'fk_leave_movement_tenant_account',
          'leave_accounts',
          ['companyId', 'accountId'],
          ['companyId', 'id'],
        ],
        [
          'leave_balance_movements',
          'fk_leave_movement_tenant_entitlement',
          'leave_entitlements',
          ['companyId', 'entitlementId'],
          ['companyId', 'id'],
        ],
        [
          'leave_requests',
          'fk_leave_request_tenant_account',
          'leave_accounts',
          ['companyId', 'accountId'],
          ['companyId', 'id'],
        ],
        [
          'leave_requests',
          'fk_leave_request_tenant_employee',
          'employees',
          ['companyId', 'employeeId'],
          ['companyId', 'id'],
        ],
        [
          'leave_request_periods',
          'fk_leave_period_tenant_request',
          'leave_requests',
          ['companyId', 'requestId'],
          ['companyId', 'id'],
        ],
        [
          'leave_approvals',
          'fk_leave_approval_tenant_request',
          'leave_requests',
          ['companyId', 'requestId'],
          ['companyId', 'id'],
        ],
        [
          'leave_interruptions',
          'fk_leave_interruption_tenant_request',
          'leave_requests',
          ['companyId', 'requestId'],
          ['companyId', 'id'],
        ],
      ];
      for (const [table, name, target, columns, targetColumns] of compositeFks) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}"
           ADD CONSTRAINT "${name}"
           FOREIGN KEY (${columns.map((c) => `"${c}"`).join(', ')})
           REFERENCES "${target}" (${targetColumns.map((c) => `"${c}"`).join(', ')})
           ON DELETE RESTRICT ON UPDATE CASCADE`,
        );
      }

      const checks = [
        ['leave_accounts', 'ck_leave_account_status', `("status" IN ('ACTIVE','CLOSED'))`],
        [
          'leave_entitlements',
          'ck_leave_entitlement_days',
          `("days" > 0 AND "accrualPeriodEnd" >= "accrualPeriodStart")`,
        ],
        [
          'leave_balance_movements',
          'ck_leave_movement',
          `("movementType" IN ('ACCRUAL','ADJUSTMENT','RESERVATION','RELEASE','USAGE') AND "days" <> 0)`,
        ],
        [
          'leave_requests',
          'ck_leave_request_status',
          `("status" IN ('DRAFT','PENDING_APPROVAL','RETURNED','APPROVED','REJECTED','IN_PROGRESS','PARTIALLY_COMPLETED','INTERRUPTED','COMPLETED','CANCELLED'))`,
        ],
        [
          'leave_requests',
          'ck_leave_request_type',
          `("leaveType" IN ('ANNUAL','SICK','SPECIAL','UNPAID','OTHER'))`,
        ],
        [
          'leave_requests',
          'ck_leave_request_days',
          `("requestedDays" > 0 AND "endDate" >= "startDate")`,
        ],
        [
          'leave_request_periods',
          'ck_leave_period',
          `("calculatedDays" > 0 AND "endDate" >= "startDate")`,
        ],
        [
          'leave_approvals',
          'ck_leave_approval_decision',
          `("decision" IN ('APPROVED','REJECTED','RETURNED'))`,
        ],
        ['leave_interruptions', 'ck_leave_interruption_period', `("endDate" >= "startDate")`],
      ];
      for (const [table, name, expression] of checks) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" CHECK ${expression}`,
        );
      }

      const tables = [
        'leave_accounts',
        'leave_entitlements',
        'leave_balance_movements',
        'leave_requests',
        'leave_request_periods',
        'leave_approvals',
        'leave_interruptions',
        'leave_outbox',
      ];
      for (const table of tables) {
        const policy = `${table}_tenant_isolation`;
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
        await queryInterface.sequelize.query(
          `CREATE POLICY "${policy}" ON "${table}"
           USING ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)
           WITH CHECK ("companyId" = NULLIF(current_setting('app.current_tenant', true), '')::integer)`,
        );
      }
    }
  },

  async down(queryInterface) {
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      for (const table of [
        'leave_outbox',
        'leave_interruptions',
        'leave_approvals',
        'leave_request_periods',
        'leave_requests',
        'leave_balance_movements',
        'leave_entitlements',
        'leave_accounts',
      ]) {
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
      }
    }
    await queryInterface.dropTable('leave_outbox');
    await queryInterface.dropTable('leave_interruptions');
    await queryInterface.dropTable('leave_approvals');
    await queryInterface.dropTable('leave_request_periods');
    await queryInterface.dropTable('leave_requests');
    await queryInterface.dropTable('leave_balance_movements');
    await queryInterface.dropTable('leave_entitlements');
    await queryInterface.dropTable('leave_accounts');
  },
};
