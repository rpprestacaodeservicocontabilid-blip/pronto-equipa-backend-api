import {
  RecordQuery,
  RecordStoreContext,
} from '../../../../shared/application/ports/record-store.port';
import {
  PayrollResultRecord,
  PayrollRunRecord,
} from '../../../payroll/application/ports/payroll-persistence.port';
export interface PaymentRecord {
  id: string;
  companyId: number;
}
export interface PaymentInstructionRecord extends PaymentRecord {
  payrollResultId: string;
  employeeId: string;
  amount: string;
  currency: string;
  paymentType: string;
  method: string;
  status: string;
  idempotencyKey: string;
  beneficiarySnapshot: Record<string, unknown> | null;
  reason: string | null;
  createdBy: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentBatchRecord extends PaymentRecord {
  code: string;
  sourceAccountId: string;
  totalAmount: string;
  currency: string;
  status: string;
  description: string | null;
  createdBy: number;
  approvedBy: number | null;
  approvedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentBatchItemRecord extends PaymentRecord {
  batchId: string;
  instructionId: string;
  amount: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentOrderRecord extends PaymentRecord {
  batchId: string | null;
  instructionId: string;
  providerId: string;
  amount: string;
  currency: string;
  status: string;
  idempotencyKey: string;
  submittedAt: Date | string | null;
  createdBy: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentAttemptRecord extends PaymentRecord {
  orderId: string;
  attemptNumber: number;
  status: string;
  providerReference: string | null;
  requestHash: string;
  responseCode: string | null;
  errorCode: string | null;
  startedAt: Date | string;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentTransactionRecord extends PaymentRecord {
  orderId: string;
  providerReference: string | null;
  amount: string;
  currency: string;
  status: string;
  settledAt: Date | string | null;
  providerPayloadHash: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentApprovalRecord extends PaymentRecord {
  batchId: string;
  actorUserId: number;
  decision: string;
  reason: string | null;
  decidedAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentBankAccountRecord extends PaymentRecord {
  bankCode: string;
  accountName: string;
  accountCiphertext: string;
  accountFingerprint: string;
  currency: string;
  status: string;
  isPrimary: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentProviderConfigRecord extends PaymentRecord {
  providerId: string;
  providerType: string;
  status: string;
  endpoint: string | null;
  capabilities: string[];
  credentialSecretRef: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentStatementImportRecord extends PaymentRecord {
  sourceAccountId: string;
  fileName: string;
  fileHash: string;
  status: string;
  importedBy: number;
  rowCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentStatementEntryRecord extends PaymentRecord {
  importId: string;
  externalReference: string;
  transactionDate: Date | string;
  amount: string;
  currency: string;
  direction: string;
  description: string | null;
  matchedTransactionId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentReconciliationRecord extends PaymentRecord {
  statementEntryId: string | null;
  transactionId: string | null;
  reference: string;
  externalAmount: string;
  externalCurrency: string;
  reconciledBy: number;
  status: string;
  notes: string | null;
  evidence: Record<string, unknown> | string[] | null;
  resolvedBy: number | null;
  resolvedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentReturnRecord extends PaymentRecord {
  transactionId: string;
  amount: string;
  currency: string;
  reason: string;
  providerReference: string | null;
  returnedAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentOutboxRecord extends PaymentRecord {
  eventType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  publishedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentInboxRecord extends PaymentRecord {
  sourceEventId: string;
  eventType: string;
  status: string;
  attempts: number;
  leaseUntil: Date | string | null;
  nextAttemptAt: Date | string | null;
  processedAt: Date | string | null;
  lastError: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentPolicyRecord extends PaymentRecord {
  baseApprovals: number;
  highValueThreshold: string | null;
  highValueApprovals: number | null;
  active: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}
export interface PaymentRecordStorePort<T extends PaymentRecord> {
  findOne(query: RecordQuery): Promise<T | null>;
  findAll(query: RecordQuery): Promise<T[]>;
  findAndCountAll(query: RecordQuery): Promise<{ rows: T[]; count: number }>;
  create(
    input: Partial<T> & PaymentRecord,
    options?: { transaction?: RecordStoreContext },
  ): Promise<T>;
  updateWhere(changes: Partial<T>, query: RecordQuery): Promise<number>;
  count(query: RecordQuery): Promise<number>;
  destroy(query: RecordQuery): Promise<number>;
  findOrCreate(
    query: RecordQuery & { defaults: Partial<T> & PaymentRecord },
  ): Promise<[T, boolean]>;
  upsert(input: Partial<T> & PaymentRecord): Promise<void>;
  bulkCreate(input: Array<Partial<T> & PaymentRecord>, options?: { transaction?: RecordStoreContext }): Promise<T[]>;
}
export interface PaymentPersistencePort {
  instruction: PaymentRecordStorePort<PaymentInstructionRecord>;
  batch: PaymentRecordStorePort<PaymentBatchRecord>;
  batchItem: PaymentRecordStorePort<PaymentBatchItemRecord>;
  order: PaymentRecordStorePort<PaymentOrderRecord>;
  attempt: PaymentRecordStorePort<PaymentAttemptRecord>;
  transaction: PaymentRecordStorePort<PaymentTransactionRecord>;
  approval: PaymentRecordStorePort<PaymentApprovalRecord>;
  bankAccount: PaymentRecordStorePort<PaymentBankAccountRecord>;
  providerConfig: PaymentRecordStorePort<PaymentProviderConfigRecord>;
  statementImport: PaymentRecordStorePort<PaymentStatementImportRecord>;
  statementEntry: PaymentRecordStorePort<PaymentStatementEntryRecord>;
  reconciliation: PaymentRecordStorePort<PaymentReconciliationRecord>;
  return: PaymentRecordStorePort<PaymentReturnRecord>;
  outbox: PaymentRecordStorePort<PaymentOutboxRecord>;
  inbox: PaymentRecordStorePort<PaymentInboxRecord>;
  policy: PaymentRecordStorePort<PaymentPolicyRecord>;
  withCompany<T>(
    companyId: number,
    operation: (context: RecordStoreContext) => Promise<T>,
  ): Promise<T>;
  update<T extends PaymentRecord>(
    record: T,
    changes: Partial<T>,
    options?: { transaction?: RecordStoreContext },
  ): Promise<T>;
}
export interface PaymentSourcesPort {
  results: { findOne(query: RecordQuery): Promise<PayrollResultRecord | null> };
  runs: { findOne(query: RecordQuery): Promise<PayrollRunRecord | null> };
  history: {
    findAll(query: RecordQuery): Promise<
      Array<{
        action: string;
        actorUserId: number | null;
        createdAt: Date;
        before: Record<string, unknown> | null;
        after: Record<string, unknown> | null;
      }>
    >;
  };
}
