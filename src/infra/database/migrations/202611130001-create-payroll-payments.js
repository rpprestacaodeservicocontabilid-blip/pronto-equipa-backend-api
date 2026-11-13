"use strict";

const base = (S) => ({
  id: { type: S.UUID, primaryKey: true, allowNull: false },
  companyId: { type: S.INTEGER, allowNull: false },
  createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("CURRENT_TIMESTAMP") },
  updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("CURRENT_TIMESTAMP") },
});

module.exports = {
  async up(q, S) {
    const create = (name, fields, indexes = []) => q.createTable(name, { ...base(S), ...fields }).then(async () => {
      await q.addIndex(name, ["companyId", "id"], { name: `uq_${name}_tenant_id`, unique: true });
      for (const index of indexes) await q.addIndex(name, index.fields, { name: index.name, unique: !!index.unique });
    });
    const tenantForeignKey = (table, fields, refTable, refFields, name) => q.addConstraint(table, {
      fields, type: 'foreign key', name, references: { table: refTable, fields: refFields }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
    });
    const str = (length = 255, allowNull = false) => ({ type: S.STRING(length), allowNull });
    const uuid = (allowNull = false) => ({ type: S.UUID, allowNull });
    const money = () => ({ type: S.DECIMAL(18, 2), allowNull: false });
    await create("payment_instructions", {
      payrollResultId: uuid(), employeeId: uuid(), amount: money(), currency: str(3), paymentType: str(30), method: str(30), status: str(32),
      idempotencyKey: str(180), beneficiarySnapshot: { type: S.JSON, allowNull: true }, reason: str(1000, true), createdBy: { type: S.INTEGER, allowNull: false },
    }, [{ fields: ["companyId", "idempotencyKey"], unique: true, name: "uq_pay_instruction_idempotency" }, { fields: ["companyId", "payrollResultId"], unique: true, name: "uq_pay_instruction_payroll_result" }, { fields: ["companyId", "status"], name: "ix_pay_instruction_status" }]);
    await q.addIndex("payroll_employee_results", ["companyId", "id"], { name: "uq_payroll_result_tenant_id", unique: true });
    await q.addIndex("payroll_outbox", ["companyId", "id"], { name: "uq_payroll_outbox_tenant_id", unique: true });
    await create("payroll_payment_batches", {
      code: str(80), sourceAccountId: uuid(), totalAmount: { ...money(), defaultValue: "0.00" }, currency: str(3), status: str(32), description: str(2000, true),
      createdBy: { type: S.INTEGER, allowNull: false }, approvedBy: { type: S.INTEGER, allowNull: true }, approvedAt: { type: S.DATE, allowNull: true },
    }, [{ fields: ["companyId", "code"], unique: true, name: "uq_pay_batch_code" }, { fields: ["companyId", "status"], name: "ix_pay_batch_status" }]);
    await create("payroll_payment_batch_items", { batchId: uuid(), instructionId: uuid(), amount: money(), status: str(32) }, [{ fields: ["companyId", "batchId", "instructionId"], unique: true, name: "uq_pay_batch_item" }]);
    await create("payroll_payment_orders", {
      batchId: uuid(true), instructionId: uuid(), providerId: str(100), amount: money(), currency: str(3), status: str(32), idempotencyKey: str(180), submittedAt: { type: S.DATE, allowNull: true }, createdBy: { type: S.INTEGER, allowNull: false },
    }, [{ fields: ["companyId", "idempotencyKey"], unique: true, name: "uq_pay_order_idempotency" }, { fields: ["companyId", "status"], name: "ix_pay_order_status" }]);
    await create("payroll_payment_attempts", {
      orderId: uuid(), attemptNumber: { type: S.INTEGER, allowNull: false }, status: str(32), providerReference: str(180, true), requestHash: str(64), responseCode: str(80, true), errorCode: str(80, true), startedAt: { type: S.DATE, allowNull: false }, completedAt: { type: S.DATE, allowNull: true },
    }, [{ fields: ["companyId", "orderId", "attemptNumber"], unique: true, name: "uq_pay_attempt_number" }]);
    await create("payroll_payment_transactions", {
      orderId: uuid(), providerReference: str(180, true), amount: money(), currency: str(3), status: str(32), settledAt: { type: S.DATE, allowNull: true }, providerPayloadHash: str(64, true),
    }, [{ fields: ["companyId", "providerReference"], unique: true, name: "uq_pay_provider_reference" }, { fields: ["companyId", "status"], name: "ix_pay_transaction_status" }]);
    await create("payroll_payment_approvals", { batchId: uuid(), actorUserId: { type: S.INTEGER, allowNull: false }, decision: str(20), reason: str(1000, true), decidedAt: { type: S.DATE, allowNull: false } }, [{ fields: ["companyId", "batchId", "actorUserId"], unique: true, name: "uq_pay_approval_actor" }]);
    await create("payroll_payment_bank_accounts", {
      bankCode: str(40), accountName: str(180), accountCiphertext: { type: S.TEXT, allowNull: false }, accountFingerprint: str(16), currency: str(3), status: str(32), isPrimary: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
    }, [{ fields: ["companyId", "isPrimary"], name: "ix_pay_bank_primary" }]);
    await create("payroll_payment_provider_configs", { providerId: str(100), providerType: str(30), status: str(20), endpoint: str(500, true), capabilities: { type: S.JSON, allowNull: false }, credentialSecretRef: str(255, true) }, [{ fields: ["companyId", "providerId"], unique: true, name: "uq_pay_provider_company" }]);
    await create("payroll_payment_statement_imports", { sourceAccountId: uuid(), fileName: str(), fileHash: str(64), status: str(32), importedBy: { type: S.INTEGER, allowNull: false }, rowCount: { type: S.INTEGER, allowNull: false, defaultValue: 0 } }, [{ fields: ["companyId", "fileHash"], unique: true, name: "uq_pay_statement_file" }]);
    await create("payroll_payment_statement_entries", { importId: uuid(), externalReference: str(180), transactionDate: { type: S.DATE, allowNull: false }, amount: money(), currency: str(3), direction: str(10), description: str(1000, true), matchedTransactionId: uuid(true) }, [{ fields: ["companyId", "externalReference"], unique: true, name: "uq_pay_statement_reference" }]);
    await create("payroll_payment_reconciliations", { statementEntryId: uuid(true), transactionId: uuid(true), reference: str(180), externalAmount: money(), externalCurrency: str(3), reconciledBy: { type: S.INTEGER, allowNull: false }, status: str(32), notes: str(2000, true), evidence: { type: S.JSON, allowNull: true }, resolvedBy: { type: S.INTEGER, allowNull: true }, resolvedAt: { type: S.DATE, allowNull: true } }, [{ fields: ["companyId", "reference"], unique: true, name: "uq_pay_reconciliation_reference" }, { fields: ["companyId", "status"], name: "ix_pay_reconciliation_status" }]);
    await create("payroll_payment_returns", { transactionId: uuid(), amount: money(), currency: str(3), reason: str(1000), providerReference: str(180, true), returnedAt: { type: S.DATE, allowNull: false } }, [{ fields: ["companyId", "transactionId"], name: "ix_pay_return_transaction" }]);
    await create("payroll_payment_outbox", { eventType: str(100), aggregateId: uuid(), payload: { type: S.JSON, allowNull: false }, publishedAt: { type: S.DATE, allowNull: true } }, [{ fields: ["companyId", "publishedAt"], name: "ix_pay_outbox_pending" }]);
    await create("payroll_payment_inbox", { sourceEventId: uuid(), eventType: str(100), status: str(20), attempts: { type: S.INTEGER, allowNull: false, defaultValue: 0 }, leaseUntil: { type: S.DATE, allowNull: true }, nextAttemptAt: { type: S.DATE, allowNull: true }, processedAt: { type: S.DATE, allowNull: true }, lastError: str(1000, true) }, [{ fields: ["companyId", "sourceEventId"], unique: true, name: "uq_pay_inbox_source_event" }, { fields: ["companyId", "status", "nextAttemptAt"], name: "ix_pay_inbox_pending" }]);
    await create("payroll_payment_policies", { baseApprovals: { type: S.INTEGER, allowNull: false, defaultValue: 1 }, highValueThreshold: { type: S.DECIMAL(18, 2), allowNull: true }, highValueApprovals: { type: S.INTEGER, allowNull: true }, active: { type: S.BOOLEAN, allowNull: false, defaultValue: true } }, [{ fields: ["companyId"], unique: true, name: "uq_pay_policy_company" }]);

    await tenantForeignKey("payroll_payment_batch_items", ["companyId", "batchId"], "payroll_payment_batches", ["companyId", "id"], "fk_pay_batch_item_batch_tenant");
    await tenantForeignKey("payment_instructions", ["companyId", "payrollResultId"], "payroll_employee_results", ["companyId", "id"], "fk_pay_instruction_result_tenant");
    await tenantForeignKey("payroll_payment_batch_items", ["companyId", "instructionId"], "payment_instructions", ["companyId", "id"], "fk_pay_batch_item_instruction_tenant");
    await tenantForeignKey("payroll_payment_orders", ["companyId", "instructionId"], "payment_instructions", ["companyId", "id"], "fk_pay_order_instruction_tenant");
    await tenantForeignKey("payroll_payment_orders", ["companyId", "batchId"], "payroll_payment_batches", ["companyId", "id"], "fk_pay_order_batch_tenant");
    await tenantForeignKey("payroll_payment_attempts", ["companyId", "orderId"], "payroll_payment_orders", ["companyId", "id"], "fk_pay_attempt_order_tenant");
    await tenantForeignKey("payroll_payment_transactions", ["companyId", "orderId"], "payroll_payment_orders", ["companyId", "id"], "fk_pay_transaction_order_tenant");
    await tenantForeignKey("payroll_payment_approvals", ["companyId", "batchId"], "payroll_payment_batches", ["companyId", "id"], "fk_pay_approval_batch_tenant");
    await tenantForeignKey("payroll_payment_batches", ["companyId", "sourceAccountId"], "payroll_payment_bank_accounts", ["companyId", "id"], "fk_pay_batch_account_tenant");
    await tenantForeignKey("payroll_payment_statement_entries", ["companyId", "importId"], "payroll_payment_statement_imports", ["companyId", "id"], "fk_pay_statement_entry_import_tenant");
    await tenantForeignKey("payroll_payment_statement_entries", ["companyId", "matchedTransactionId"], "payroll_payment_transactions", ["companyId", "id"], "fk_pay_statement_entry_transaction_tenant");
    await tenantForeignKey("payroll_payment_reconciliations", ["companyId", "transactionId"], "payroll_payment_transactions", ["companyId", "id"], "fk_pay_reconciliation_transaction_tenant");
    await tenantForeignKey("payroll_payment_reconciliations", ["companyId", "statementEntryId"], "payroll_payment_statement_entries", ["companyId", "id"], "fk_pay_reconciliation_entry_tenant");
    await tenantForeignKey("payroll_payment_returns", ["companyId", "transactionId"], "payroll_payment_transactions", ["companyId", "id"], "fk_pay_return_transaction_tenant");
    await tenantForeignKey("payroll_payment_inbox", ["companyId", "sourceEventId"], "payroll_outbox", ["companyId", "id"], "fk_pay_inbox_source_event_tenant");
  },
  async down(q) {
    for (const table of ["payroll_payment_policies", "payroll_payment_inbox", "payroll_payment_outbox", "payroll_payment_returns", "payroll_payment_reconciliations", "payroll_payment_statement_entries", "payroll_payment_statement_imports", "payroll_payment_provider_configs", "payroll_payment_bank_accounts", "payroll_payment_approvals", "payroll_payment_transactions", "payroll_payment_attempts", "payroll_payment_orders", "payroll_payment_batch_items", "payroll_payment_batches", "payment_instructions"]) await q.dropTable(table);
    await q.removeIndex("payroll_employee_results", "uq_payroll_result_tenant_id");
    await q.removeIndex("payroll_outbox", "uq_payroll_outbox_tenant_id");
  },
};
