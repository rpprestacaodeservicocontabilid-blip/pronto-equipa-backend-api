'use strict';

const tables = [
  'loan_applications',
  'loan_approvals',
  'employee_loans',
  'loan_policies',
  'loan_repayment_plans',
  'loan_installments',
  'loan_disbursements',
  'loan_repayments',
  'loan_ledger_entries',
  'loan_payroll_deductions',
  'loan_renegotiations',
  'loan_outbox',
];

const companyReference = (Sequelize) => ({
  type: Sequelize.INTEGER.UNSIGNED,
  allowNull: false,
  references: { model: 'companies', key: 'id' },
  onDelete: 'CASCADE',
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('loan_applications', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: companyReference(Sequelize),
      employeeId: { type: Sequelize.UUID, allowNull: false },
      loanType: { type: Sequelize.STRING(30), allowNull: false },
      requestedAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false },
      installmentCount: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      frequency: { type: Sequelize.STRING(20), allowNull: false },
      firstDueDate: { type: Sequelize.DATEONLY, allowNull: false },
      annualInterestBps: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'DRAFT' },
      reason: { type: Sequelize.STRING(2000), allowNull: false },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('loan_applications', ['companyId', 'id'], { unique: true, name: 'uq_loan_application_company_id' });
    await queryInterface.addIndex('loan_applications', ['companyId', 'employeeId', 'status'], { name: 'idx_loan_application_employee' });
    await queryInterface.addIndex('loan_applications', ['companyId', 'status', 'createdAt'], { name: 'idx_loan_application_status' });

    await queryInterface.createTable('loan_approvals', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: companyReference(Sequelize),
      applicationId: { type: Sequelize.UUID, allowNull: false },
      approverId: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      decision: { type: Sequelize.STRING(20), allowNull: false },
      comments: { type: Sequelize.STRING(2000), allowNull: true },
      decidedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('loan_approvals', ['companyId', 'applicationId', 'decidedAt'], { name: 'idx_loan_approval_application' });

    await queryInterface.createTable('employee_loans', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: companyReference(Sequelize),
      employeeId: { type: Sequelize.UUID, allowNull: false },
      applicationId: { type: Sequelize.UUID, allowNull: false },
      loanNumber: { type: Sequelize.STRING(50), allowNull: false },
      principalAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false },
      status: { type: Sequelize.STRING(30), allowNull: false },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      disbursedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('employee_loans', ['companyId', 'id'], { unique: true, name: 'uq_loan_company_id' });
    await queryInterface.addIndex('employee_loans', ['companyId', 'loanNumber'], { unique: true, name: 'uq_loan_company_number' });
    await queryInterface.addIndex('employee_loans', ['companyId', 'applicationId'], { unique: true, name: 'uq_loan_application' });
    await queryInterface.addIndex('employee_loans', ['companyId', 'employeeId', 'status'], { name: 'idx_loan_employee_status' });

    await queryInterface.createTable('loan_policies', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: companyReference(Sequelize),
      code: { type: Sequelize.STRING(50), allowNull: false },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      effectiveFrom: { type: Sequelize.DATEONLY, allowNull: false },
      effectiveTo: { type: Sequelize.DATEONLY, allowNull: true },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      maxAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      maxInstallments: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      maxActiveLoans: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      allowedTypes: { type: Sequelize.JSON, allowNull: false },
      interestAllowed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      maxAnnualInterestBps: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      deductionAuthorizationRequired: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('loan_policies', ['companyId', 'code', 'version'], { unique: true, name: 'uq_loan_policy_version' });
    await queryInterface.addIndex('loan_policies', ['companyId', 'code', 'active', 'effectiveFrom'], { name: 'idx_loan_policy_effective' });

    await queryInterface.createTable('loan_repayment_plans', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: companyReference(Sequelize),
      loanId: { type: Sequelize.UUID, allowNull: false },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      totalAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      installmentCount: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      effectiveFrom: { type: Sequelize.DATEONLY, allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('loan_repayment_plans', ['companyId', 'loanId', 'version'], { unique: true, name: 'uq_loan_plan_version' });
    await queryInterface.addIndex('loan_repayment_plans', ['companyId', 'id'], { unique: true, name: 'uq_loan_plan_company_id' });
    await queryInterface.addIndex('loan_repayment_plans', ['companyId', 'loanId', 'status'], { name: 'idx_loan_plan_active' });

    await queryInterface.createTable('loan_installments', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: companyReference(Sequelize),
      loanId: { type: Sequelize.UUID, allowNull: false },
      planId: { type: Sequelize.UUID, allowNull: false },
      installmentNumber: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      dueDate: { type: Sequelize.DATEONLY, allowNull: false },
      principalDue: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      interestDue: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'PENDING' },
    });
    await queryInterface.addIndex('loan_installments', ['companyId', 'planId', 'installmentNumber'], { unique: true, name: 'uq_loan_installment_number' });
    await queryInterface.addIndex('loan_installments', ['companyId', 'id'], { unique: true, name: 'uq_loan_installment_company_id' });
    await queryInterface.addIndex('loan_installments', ['companyId', 'loanId', 'dueDate', 'status'], { name: 'idx_loan_installment_due' });

    await queryInterface.createTable('loan_disbursements', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: companyReference(Sequelize),
      loanId: { type: Sequelize.UUID, allowNull: false },
      amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      paymentReference: { type: Sequelize.STRING(200), allowNull: true },
      idempotencyKey: { type: Sequelize.STRING(200), allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'REQUESTED' },
      confirmedAt: { type: Sequelize.DATE, allowNull: true },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('loan_disbursements', ['companyId', 'idempotencyKey'], { unique: true, name: 'uq_loan_disbursement_idempotency' });
    await queryInterface.addIndex('loan_disbursements', ['companyId', 'paymentReference'], { unique: true, name: 'uq_loan_disbursement_payment_reference' });
    await queryInterface.addIndex('loan_disbursements', ['companyId', 'loanId', 'status'], { name: 'idx_loan_disbursement_status' });

    await queryInterface.createTable('loan_repayments', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: companyReference(Sequelize),
      loanId: { type: Sequelize.UUID, allowNull: false },
      amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false },
      source: { type: Sequelize.STRING(40), allowNull: false },
      externalReference: { type: Sequelize.STRING(200), allowNull: true },
      idempotencyKey: { type: Sequelize.STRING(200), allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'CONFIRMED' },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('loan_repayments', ['companyId', 'source', 'idempotencyKey'], { unique: true, name: 'uq_loan_repayment_idempotency' });
    await queryInterface.addIndex('loan_repayments', ['companyId', 'source', 'externalReference'], { unique: true, name: 'uq_loan_repayment_external_reference' });
    await queryInterface.addIndex('loan_repayments', ['companyId', 'loanId', 'createdAt'], { name: 'idx_loan_repayment_history' });

    await queryInterface.createTable('loan_ledger_entries', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: companyReference(Sequelize),
      loanId: { type: Sequelize.UUID, allowNull: false },
      installmentId: { type: Sequelize.UUID, allowNull: true },
      entryType: { type: Sequelize.STRING(20), allowNull: false },
      principalAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      interestAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false },
      source: { type: Sequelize.STRING(40), allowNull: false },
      externalReference: { type: Sequelize.STRING(200), allowNull: true },
      idempotencyKey: { type: Sequelize.STRING(200), allowNull: false },
      occurredAt: { type: Sequelize.DATE, allowNull: false },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
    });
    await queryInterface.addIndex('loan_ledger_entries', ['companyId', 'source', 'idempotencyKey'], { unique: true, name: 'uq_loan_ledger_idempotency' });
    await queryInterface.addIndex('loan_ledger_entries', ['companyId', 'loanId', 'occurredAt'], { name: 'idx_loan_ledger_history' });
    await queryInterface.addIndex('loan_ledger_entries', ['companyId', 'loanId', 'installmentId'], { name: 'idx_loan_ledger_installment' });

    await queryInterface.createTable('loan_payroll_deductions', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: companyReference(Sequelize),
      loanId: { type: Sequelize.UUID, allowNull: false },
      installmentId: { type: Sequelize.UUID, allowNull: false },
      payrollRunId: { type: Sequelize.STRING(150), allowNull: true },
      requestedAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      confirmedAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'REQUESTED' },
      idempotencyKey: { type: Sequelize.STRING(200), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('loan_payroll_deductions', ['companyId', 'idempotencyKey'], { unique: true, name: 'uq_loan_deduction_idempotency' });
    await queryInterface.addIndex('loan_payroll_deductions', ['companyId', 'payrollRunId', 'installmentId'], { unique: true, name: 'uq_loan_deduction_payroll' });
    await queryInterface.addIndex('loan_payroll_deductions', ['companyId', 'loanId', 'status'], { name: 'idx_loan_deduction_status' });

    await queryInterface.createTable('loan_renegotiations', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      companyId: companyReference(Sequelize),
      loanId: { type: Sequelize.UUID, allowNull: false },
      previousPlanId: { type: Sequelize.UUID, allowNull: false },
      newPlanId: { type: Sequelize.UUID, allowNull: true },
      installmentCount: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      firstDueDate: { type: Sequelize.DATEONLY, allowNull: false },
      frequency: { type: Sequelize.STRING(20), allowNull: false },
      reason: { type: Sequelize.STRING(2000), allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'PENDING' },
      requestedBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      decidedBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      decidedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('loan_renegotiations', ['companyId', 'loanId', 'status'], { name: 'idx_loan_renegotiation_status' });

    await queryInterface.createTable('loan_outbox', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      companyId: companyReference(Sequelize),
      aggregateId: { type: Sequelize.UUID, allowNull: false },
      eventType: { type: Sequelize.STRING(100), allowNull: false },
      payload: { type: Sequelize.JSON, allowNull: false },
      occurredAt: { type: Sequelize.DATE, allowNull: false },
      publishedAt: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('loan_outbox', ['publishedAt', 'occurredAt'], { name: 'idx_loan_outbox_pending' });

    if (queryInterface.sequelize.getDialect() === 'postgres') {
      const compositeForeignKeys = [
        ['loan_applications', 'employeeId', 'employees'],
        ['employee_loans', 'employeeId', 'employees'],
        ['loan_approvals', 'applicationId', 'loan_applications'],
        ['employee_loans', 'applicationId', 'loan_applications'],
        ['loan_repayment_plans', 'loanId', 'employee_loans'],
        ['loan_installments', 'loanId', 'employee_loans'],
        ['loan_installments', 'planId', 'loan_repayment_plans'],
        ['loan_disbursements', 'loanId', 'employee_loans'],
        ['loan_repayments', 'loanId', 'employee_loans'],
        ['loan_ledger_entries', 'loanId', 'employee_loans'],
        ['loan_ledger_entries', 'installmentId', 'loan_installments'],
        ['loan_payroll_deductions', 'loanId', 'employee_loans'],
        ['loan_payroll_deductions', 'installmentId', 'loan_installments'],
        ['loan_renegotiations', 'loanId', 'employee_loans'],
        ['loan_renegotiations', 'previousPlanId', 'loan_repayment_plans'],
        ['loan_renegotiations', 'newPlanId', 'loan_repayment_plans'],
      ];
      for (const [source, field, target] of compositeForeignKeys) {
        const constraint = `fk_${source}_${field}_tenant`;
        await queryInterface.sequelize.query(
          `ALTER TABLE "${source}" ADD CONSTRAINT "${constraint}"
           FOREIGN KEY ("companyId", "${field}") REFERENCES "${target}" ("companyId", "id")
           ON DELETE RESTRICT`,
        );
      }

      await queryInterface.sequelize.query(
        `CREATE FUNCTION prevent_loan_ledger_mutation() RETURNS trigger AS $$
         BEGIN RAISE EXCEPTION 'Loan ledger entries are immutable'; END;
         $$ LANGUAGE plpgsql`,
      );
      await queryInterface.sequelize.query(
        `CREATE TRIGGER loan_ledger_immutable BEFORE UPDATE OR DELETE ON "loan_ledger_entries"
         FOR EACH ROW EXECUTE FUNCTION prevent_loan_ledger_mutation()`,
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
      await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS loan_ledger_immutable ON "loan_ledger_entries"');
      await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS prevent_loan_ledger_mutation()');
      for (const table of tables) {
        await queryInterface.sequelize.query(`DROP POLICY IF EXISTS "${table}_tenant_isolation" ON "${table}"`);
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`);
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
      }
    }
    for (const table of [...tables].reverse()) await queryInterface.dropTable(table);
  },
};
