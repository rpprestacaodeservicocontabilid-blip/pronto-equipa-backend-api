import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

/** Durable payment records. All identifiers are scoped by companyId. */
export class PayrollPaymentInstructionModel extends Model {}
export class PayrollPaymentBatchModel extends Model {}
export class PayrollPaymentBatchItemModel extends Model {}
export class PayrollPaymentOrderModel extends Model {}
export class PayrollPaymentAttemptModel extends Model {}
export class PayrollPaymentTransactionModel extends Model {}
export class PayrollPaymentApprovalModel extends Model {}
export class PayrollPaymentBankAccountModel extends Model {}
export class PayrollPaymentProviderConfigModel extends Model {}
export class PayrollPaymentReturnModel extends Model {}
export class PayrollPaymentOutboxModel extends Model {}
export class PayrollPaymentInboxModel extends Model {}
export class PayrollPaymentPolicyModel extends Model {}
export class PayrollPaymentStatementImportModel extends Model {}
export class PayrollPaymentStatementEntryModel extends Model {}
export class PayrollPaymentReconciliationModel extends Model {}

const identity = () => ({
  id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
  companyId: { type: DataTypes.INTEGER, allowNull: false },
});
const timestamps = { createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE };
const init = (
  model: any,
  tableName: string,
  attributes: Record<string, unknown>,
  indexes: any[] = [],
) => model.init({ ...identity(), ...attributes, ...timestamps }, { sequelize, tableName, indexes });

init(
  PayrollPaymentInstructionModel,
  'payment_instructions',
  {
    payrollResultId: { type: DataTypes.UUID, allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    paymentType: { type: DataTypes.STRING(30), allowNull: false },
    method: { type: DataTypes.STRING(30), allowNull: false },
    status: { type: DataTypes.STRING(32), allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(180), allowNull: false },
    beneficiarySnapshot: { type: DataTypes.JSON, allowNull: true },
    reason: { type: DataTypes.STRING(1000), allowNull: true },
    createdBy: { type: DataTypes.INTEGER, allowNull: false },
  },
  [
    { unique: true, fields: ['companyId', 'idempotencyKey'] },
    { unique: true, fields: ['companyId', 'payrollResultId'] },
    { fields: ['companyId', 'status'] },
  ],
);
init(
  PayrollPaymentBatchModel,
  'payroll_payment_batches',
  {
    code: { type: DataTypes.STRING(80), allowNull: false },
    sourceAccountId: { type: DataTypes.UUID, allowNull: false },
    totalAmount: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: '0.00' },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    status: { type: DataTypes.STRING(32), allowNull: false },
    description: { type: DataTypes.STRING(2000), allowNull: true },
    createdBy: { type: DataTypes.INTEGER, allowNull: false },
    approvedBy: { type: DataTypes.INTEGER, allowNull: true },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
  },
  [{ unique: true, fields: ['companyId', 'code'] }, { fields: ['companyId', 'status'] }],
);
init(
  PayrollPaymentBatchItemModel,
  'payroll_payment_batch_items',
  {
    batchId: { type: DataTypes.UUID, allowNull: false },
    instructionId: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    status: { type: DataTypes.STRING(32), allowNull: false },
  },
  [{ unique: true, fields: ['companyId', 'batchId', 'instructionId'] }],
);
init(
  PayrollPaymentOrderModel,
  'payroll_payment_orders',
  {
    batchId: { type: DataTypes.UUID, allowNull: true },
    instructionId: { type: DataTypes.UUID, allowNull: false },
    providerId: { type: DataTypes.STRING(100), allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    status: { type: DataTypes.STRING(32), allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(180), allowNull: false },
    submittedAt: { type: DataTypes.DATE, allowNull: true },
    createdBy: { type: DataTypes.INTEGER, allowNull: false },
  },
  [{ unique: true, fields: ['companyId', 'idempotencyKey'] }, { fields: ['companyId', 'status'] }],
);
init(
  PayrollPaymentAttemptModel,
  'payroll_payment_attempts',
  {
    orderId: { type: DataTypes.UUID, allowNull: false },
    attemptNumber: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(32), allowNull: false },
    providerReference: { type: DataTypes.STRING(180), allowNull: true },
    requestHash: { type: DataTypes.STRING(64), allowNull: false },
    responseCode: { type: DataTypes.STRING(80), allowNull: true },
    errorCode: { type: DataTypes.STRING(80), allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: false },
    completedAt: { type: DataTypes.DATE, allowNull: true },
  },
  [{ unique: true, fields: ['companyId', 'orderId', 'attemptNumber'] }],
);
init(
  PayrollPaymentTransactionModel,
  'payroll_payment_transactions',
  {
    orderId: { type: DataTypes.UUID, allowNull: false },
    providerReference: { type: DataTypes.STRING(180), allowNull: true },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    status: { type: DataTypes.STRING(32), allowNull: false },
    settledAt: { type: DataTypes.DATE, allowNull: true },
    providerPayloadHash: { type: DataTypes.STRING(64), allowNull: true },
  },
  [
    { unique: true, fields: ['companyId', 'providerReference'] },
    { fields: ['companyId', 'status'] },
  ],
);
init(
  PayrollPaymentApprovalModel,
  'payroll_payment_approvals',
  {
    batchId: { type: DataTypes.UUID, allowNull: false },
    actorUserId: { type: DataTypes.INTEGER, allowNull: false },
    decision: { type: DataTypes.STRING(20), allowNull: false },
    reason: { type: DataTypes.STRING(1000), allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: false },
  },
  [{ unique: true, fields: ['companyId', 'batchId', 'actorUserId'] }],
);
init(
  PayrollPaymentBankAccountModel,
  'payroll_payment_bank_accounts',
  {
    bankCode: { type: DataTypes.STRING(40), allowNull: false },
    accountName: { type: DataTypes.STRING(180), allowNull: false },
    accountCiphertext: { type: DataTypes.TEXT, allowNull: false },
    accountFingerprint: { type: DataTypes.STRING(16), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    status: { type: DataTypes.STRING(32), allowNull: false },
    isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  [{ fields: ['companyId', 'isPrimary'] }],
);
init(
  PayrollPaymentProviderConfigModel,
  'payroll_payment_provider_configs',
  {
    providerId: { type: DataTypes.STRING(100), allowNull: false },
    providerType: { type: DataTypes.STRING(30), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false },
    endpoint: { type: DataTypes.STRING(500), allowNull: true },
    capabilities: { type: DataTypes.JSON, allowNull: false },
    credentialSecretRef: { type: DataTypes.STRING(255), allowNull: true },
  },
  [{ unique: true, fields: ['companyId', 'providerId'] }],
);
init(
  PayrollPaymentStatementImportModel,
  'payroll_payment_statement_imports',
  {
    sourceAccountId: { type: DataTypes.UUID, allowNull: false },
    fileName: { type: DataTypes.STRING(255), allowNull: false },
    fileHash: { type: DataTypes.STRING(64), allowNull: false },
    status: { type: DataTypes.STRING(32), allowNull: false },
    importedBy: { type: DataTypes.INTEGER, allowNull: false },
    rowCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  [{ unique: true, fields: ['companyId', 'fileHash'] }],
);
init(
  PayrollPaymentStatementEntryModel,
  'payroll_payment_statement_entries',
  {
    importId: { type: DataTypes.UUID, allowNull: false },
    externalReference: { type: DataTypes.STRING(180), allowNull: false },
    transactionDate: { type: DataTypes.DATE, allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    direction: { type: DataTypes.STRING(10), allowNull: false },
    description: { type: DataTypes.STRING(1000), allowNull: true },
    matchedTransactionId: { type: DataTypes.UUID, allowNull: true },
  },
  [{ unique: true, fields: ['companyId', 'externalReference'] }],
);
init(
  PayrollPaymentReconciliationModel,
  'payroll_payment_reconciliations',
  {
    statementEntryId: { type: DataTypes.UUID, allowNull: true },
    transactionId: { type: DataTypes.UUID, allowNull: true },
    reference: { type: DataTypes.STRING(180), allowNull: false },
    externalAmount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    externalCurrency: { type: DataTypes.STRING(3), allowNull: false },
    reconciledBy: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(32), allowNull: false },
    notes: { type: DataTypes.STRING(2000), allowNull: true },
    evidence: { type: DataTypes.JSON, allowNull: true },
    resolvedBy: { type: DataTypes.INTEGER, allowNull: true },
    resolvedAt: { type: DataTypes.DATE, allowNull: true },
  },
  [{ unique: true, fields: ['companyId', 'reference'] }, { fields: ['companyId', 'status'] }],
);
init(
  PayrollPaymentReturnModel,
  'payroll_payment_returns',
  {
    transactionId: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    reason: { type: DataTypes.STRING(1000), allowNull: false },
    providerReference: { type: DataTypes.STRING(180), allowNull: true },
    returnedAt: { type: DataTypes.DATE, allowNull: false },
  },
  [{ fields: ['companyId', 'transactionId'] }],
);
init(
  PayrollPaymentOutboxModel,
  'payroll_payment_outbox',
  {
    eventType: { type: DataTypes.STRING(100), allowNull: false },
    aggregateId: { type: DataTypes.UUID, allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: false },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
  },
  [{ fields: ['companyId', 'publishedAt'] }],
);
init(
  PayrollPaymentInboxModel,
  'payroll_payment_inbox',
  {
    sourceEventId: { type: DataTypes.UUID, allowNull: false },
    eventType: { type: DataTypes.STRING(100), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    leaseUntil: { type: DataTypes.DATE, allowNull: true },
    nextAttemptAt: { type: DataTypes.DATE, allowNull: true },
    processedAt: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.STRING(1000), allowNull: true },
  },
  [
    { unique: true, fields: ['companyId', 'sourceEventId'] },
    { fields: ['companyId', 'status', 'nextAttemptAt'] },
  ],
);
init(
  PayrollPaymentPolicyModel,
  'payroll_payment_policies',
  {
    baseApprovals: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    highValueThreshold: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    highValueApprovals: { type: DataTypes.INTEGER, allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  [{ unique: true, fields: ['companyId'] }],
);
