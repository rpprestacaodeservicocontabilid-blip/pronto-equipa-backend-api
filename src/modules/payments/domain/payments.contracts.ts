export type PaymentStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'SETTLED'
  | 'RECONCILED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'SUBMISSION_UNKNOWN'
  | 'FAILED'
  | 'RETURNED'
  | 'PARTIALLY_SETTLED'
  | 'RECONCILIATION_EXCEPTION';

export type PaymentType =
  | 'REGULAR_SALARY'
  | 'INDIVIDUAL'
  | 'BULK'
  | 'OFF_CYCLE'
  | 'SUPPLEMENTARY'
  | 'RETROACTIVE'
  | 'CORRECTION'
  | 'TERMINATION';

export type PaymentMethod = 'BANK_TRANSFER' | 'BULK_FILE' | 'API' | 'CASH';

export interface PaymentInstruction {
  id: string;
  companyId: number;
  payrollResultId: string;
  employeeId: string;
  amount: string;
  currency: string;
  paymentType: PaymentType;
  method: PaymentMethod;
  status: PaymentStatus;
  idempotencyKey: string;
  beneficiary?: {
    name: string;
    accountNumber: string;
    bankCode: string;
  };
  reason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentBatchItem {
  id: string;
  batchId: string;
  instructionId: string;
  amount: string;
  status:
    | 'PENDING'
    | 'VALIDATED'
    | 'SUBMITTED'
    | 'PROCESSING'
    | 'APPROVED'
    | 'REJECTED'
    | 'SETTLED'
    | 'RECONCILED'
    | 'PARTIALLY_SETTLED'
    | 'FAILED'
    | 'SUBMISSION_UNKNOWN';
  createdAt: string;
}

export interface PaymentBatch {
  id: string;
  companyId: number;
  code: string;
  sourceAccountId: string;
  totalAmount: string;
  currency: string;
  status:
    | 'DRAFT'
    | 'VALIDATED'
    | 'SUBMITTED'
    | 'APPROVED'
    | 'REJECTED'
    | 'PROCESSING'
    | 'SETTLED'
    | 'PARTIALLY_SETTLED'
    | 'FAILED'
    | 'SUBMISSION_UNKNOWN';
  description?: string;
  createdBy?: number;
  approvedBy?: number;
  createdAt: string;
  updatedAt: string;
  items: PaymentBatchItem[];
}

export interface PaymentOrder {
  id: string;
  companyId: number;
  batchId?: string;
  instructionId: string;
  providerId: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  idempotencyKey: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTransaction {
  id: string;
  companyId: number;
  orderId: string;
  providerReference: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  settledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentReconciliation {
  id: string;
  companyId: number;
  transactionId: string | null;
  reference: string;
  externalAmount: string;
  externalCurrency: string;
  reconciledBy: string;
  status: 'PENDING' | 'MATCHED' | 'RECONCILIATION_EXCEPTION' | 'RESOLVED';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentReturn {
  id: string;
  companyId: number;
  transactionId: string;
  amount: string;
  currency: string;
  reason: string;
  returnedAt: string;
}

export interface PaymentSummaryReport {
  totalAuthorized: string | null;
  totalConfirmed: string | null;
  pendingPayments: number;
  failedPayments: number;
  byCurrency: { currency: string; authorized: string; confirmed: string }[];
}
