export interface PaymentProviderSubmission {
  providerReference: string;
  status: 'SUBMITTED' | 'PROCESSING' | 'SETTLED' | 'FAILED';
  settledAt?: Date;
}

export interface PaymentTransferRequest {
  companyId: number;
  orderId: string;
  idempotencyKey: string;
  amount: string;
  currency: string;
  beneficiary: { name: string; accountNumber: string; bankCode: string };
}

export interface PaymentTransferStatusRequest {
  companyId: number;
  orderId: string;
  idempotencyKey: string;
  providerReference?: string;
}

/** Implement this port only for a bank API/file channel that has been contracted and configured. */
export interface PaymentProviderPort {
  readonly id: string;
  readonly name: string;
  readonly type: 'BANK' | 'GATEWAY' | 'FILE_PROVIDER';
  readonly capabilities?: readonly string[];
  submitTransfer(request: PaymentTransferRequest): Promise<PaymentProviderSubmission>;
  getTransferStatus?(request: PaymentTransferStatusRequest): Promise<PaymentProviderSubmission>;
}

export class PaymentSubmissionUnknownError extends Error {
  constructor(
    message = 'Provider submission outcome is unknown; query the provider before retrying.',
  ) {
    super(message);
    this.name = 'PaymentSubmissionUnknownError';
  }
}
