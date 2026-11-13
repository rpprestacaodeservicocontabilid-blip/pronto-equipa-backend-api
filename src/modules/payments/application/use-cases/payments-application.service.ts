import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { ConflictError, NotFoundError } from '../../../../shared/errors/app.error';
import { PayrollEmployeeResultModel, PayrollRunModel } from '../../../payroll/infrastructure/payroll.models';
import {
  PayrollPaymentApprovalModel, PayrollPaymentBatchItemModel, PayrollPaymentBatchModel,
  PayrollPaymentInstructionModel, PayrollPaymentReconciliationModel,
  PayrollPaymentStatementEntryModel, PayrollPaymentStatementImportModel,
  PayrollPaymentTransactionModel, PayrollPaymentAttemptModel, PayrollPaymentProviderConfigModel, PayrollPaymentOrderModel, PayrollPaymentReturnModel,
  PayrollPaymentPolicyModel,
} from '../../infrastructure/payment.models';
import { PayrollPaymentBankAccountModel } from '../../infrastructure/payment.models';
import { Op, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../../../../infra/database';
import { AuditLogModel } from '../../../audit/infrastructure/persistence/model/audit-log.model';
import { PaymentProviderPort, PaymentProviderSubmission, PaymentSubmissionUnknownError } from '../ports/payment-provider.port';

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
  status: 'PENDING' | 'VALIDATED' | 'SUBMITTED' | 'PROCESSING' | 'APPROVED' | 'REJECTED' | 'SETTLED' | 'RECONCILED' | 'PARTIALLY_SETTLED' | 'FAILED' | 'SUBMISSION_UNKNOWN';
  createdAt: string;
}

export interface PaymentBatch {
  id: string;
  companyId: number;
  code: string;
  sourceAccountId: string;
  totalAmount: string;
  currency: string;
  status: 'DRAFT' | 'VALIDATED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PROCESSING' | 'SETTLED' | 'PARTIALLY_SETTLED' | 'FAILED' | 'SUBMISSION_UNKNOWN';
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

export interface CompanyBankAccount {
  id: string;
  companyId: number;
  bankCode: string;
  accountName: string;
  accountIdentifier: string;
  /** Only ciphertext is persisted; the API field above contains a masked value. */
  fingerprint: string;
  currency: string;
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'DISABLED';
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderConfiguration {
  id: string;
  companyId: number;
  providerId: string;
  providerType: 'BANK' | 'GATEWAY' | 'FILE_PROVIDER';
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
  endpoint?: string;
  capabilities: string[];
  createdAt: string;
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
  totalAuthorized: string;
  totalConfirmed: string;
  pendingPayments: number;
  failedPayments: number;
}

export interface CreatePaymentInstructionInput {
  payrollResultId: string;
  employeeId: string;
  /** Client amount is optional and is only checked against the closed payroll result. */
  amount?: number | string;
  currency?: string;
  paymentType?: PaymentType;
  method?: PaymentMethod;
  beneficiary?: {
    name: string;
    accountNumber: string;
    bankCode: string;
  };
  idempotencyKey?: string;
  reason?: string;
}

export class PaymentsApplicationService {
  private readonly instructions: PaymentInstruction[] = [];
  private readonly batches: PaymentBatch[] = [];
  private readonly orders: PaymentOrder[] = [];
  private readonly transactions: PaymentTransaction[] = [];
  private readonly bankAccounts: CompanyBankAccount[] = [];
  private readonly providerConfigurations: ProviderConfiguration[] = [];
  private readonly reconciliations: PaymentReconciliation[] = [];
  private readonly returns: PaymentReturn[] = [];
  // Provider adapters are deliberately not fabricated. Add a real adapter before enabling execution.
  constructor(private readonly audit: AuditRecorderPort, private readonly providerAdapters: readonly PaymentProviderPort[] = []) {}

  async listInstructions(companyId: number, query: { page: number; limit: number; status?: string }) {
    const result = await PayrollPaymentInstructionModel.findAndCountAll({
      where: { companyId, ...(query.status ? { status: query.status } : {}) },
      order: [['createdAt', 'DESC']], limit: query.limit, offset: (query.page - 1) * query.limit,
    });
    return { page: query.page, limit: query.limit, total: result.count, data: result.rows.map((item) => this.presentInstruction(item.get({ plain: true }) as any)) };
  }

  async createInstruction(companyId: number, actorUserId: number, input: CreatePaymentInstructionInput) {
    const payrollResult = await PayrollEmployeeResultModel.findOne({
      where: { companyId, id: input.payrollResultId, employeeId: input.employeeId },
    });
    if (!payrollResult) throw new NotFoundError('Closed payroll result');
    const result = payrollResult.get({ plain: true }) as any;
    const run = await PayrollRunModel.findOne({ where: { companyId, id: result.runId } });
    if (!run || run.get('status') !== 'CLOSED' || run.get('runType') === 'SIMULATION') {
      throw new ConflictError('Payment instructions can only be created from a closed, non-simulation payroll run.');
    }
    const amount = this.normalizeAmount(String(result.netAmount));
    if (BigInt(amount.replace('.', '')) <= 0n) {
      throw new ConflictError('Zero or negative payroll results cannot be paid as a regular payment instruction.');
    }
    if (input.amount !== undefined && this.normalizeAmount(input.amount) !== amount) {
      throw new ConflictError('Payment amount must match the closed payroll result exactly.');
    }
    if (input.currency && input.currency.toUpperCase() !== String(result.currency).toUpperCase()) {
      throw new ConflictError('Payment currency must match the closed payroll result.');
    }
    if (input.method && input.method !== 'BANK_TRANSFER') throw new ConflictError('Only bank transfer execution is enabled for payroll payment instructions.');
    const paymentTypeByRun: Record<string, PaymentType> = {
      REGULAR: 'REGULAR_SALARY', OFF_CYCLE: 'OFF_CYCLE', SUPPLEMENTARY: 'SUPPLEMENTARY',
      RETROACTIVE: 'RETROACTIVE', CORRECTION: 'CORRECTION', TERMINATION: 'TERMINATION',
    };
    const paymentType = paymentTypeByRun[String(run.get('runType'))] ?? 'REGULAR_SALARY';
    if (input.paymentType && input.paymentType !== paymentType) throw new ConflictError('Payment type must match the source payroll run.');
    const key = input.idempotencyKey ?? `payroll-result:${input.payrollResultId}`;
    const persisted = await PayrollPaymentInstructionModel.findOne({ where: { companyId, idempotencyKey: key } });
    if (persisted) return this.presentInstruction(persisted.get({ plain: true }) as any);
    const existingForResult = await PayrollPaymentInstructionModel.findOne({ where: { companyId, payrollResultId: input.payrollResultId } });
    if (existingForResult) throw new ConflictError('A payment instruction already exists for this payroll result.');
    const existing = this.instructions.find(
      (item) => item.companyId === companyId && item.idempotencyKey === key,
    );
    if (existing) {
      return existing;
    }

    const instruction: PaymentInstruction = {
      id: randomUUID(),
      companyId,
      payrollResultId: input.payrollResultId,
      employeeId: input.employeeId,
      amount,
      currency: String(result.currency).toUpperCase(),
      paymentType,
      method: input.method ?? 'BANK_TRANSFER',
      status: 'PENDING_APPROVAL',
      idempotencyKey: key,
      beneficiary: input.beneficiary ? { ...input.beneficiary, accountNumber: this.maskAccount(input.beneficiary.accountNumber.slice(-4)) } : undefined,
      reason: input.reason,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.instructions.push(instruction);
    try {
      await PayrollPaymentInstructionModel.create({
        ...instruction,
        createdBy: actorUserId,
        beneficiarySnapshot: input.beneficiary ? {
          name: input.beneficiary.name, bankCode: input.beneficiary.bankCode,
          accountNumberCiphertext: this.encryptAccount(input.beneficiary.accountNumber),
          accountFingerprint: input.beneficiary.accountNumber.slice(-4),
        } : null,
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const raced = await PayrollPaymentInstructionModel.findOne({ where: { companyId, idempotencyKey: key } });
        if (raced) return this.presentInstruction(raced.get({ plain: true }) as any);
        throw new ConflictError('A payment instruction already exists for this payroll result.');
      }
      throw error;
    }
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.instruction.created',
      entityType: 'payment_instruction',
      entityId: instruction.id,
      after: { employeeId: instruction.employeeId, amount: instruction.amount, status: instruction.status },
    });

    return instruction;
  }

  async getInstruction(companyId: number, id: string) {
    const persisted = await PayrollPaymentInstructionModel.findOne({ where: { companyId, id } });
    if (persisted) return persisted.get({ plain: true }) as PaymentInstruction;
    const instruction = this.instructions.find((item) => item.companyId === companyId && item.id === id);
    if (!instruction) throw new NotFoundError('Payment instruction');
    return instruction;
  }

  async cancelInstruction(companyId: number, actorUserId: number, id: string) {
    const instruction = await this.getInstruction(companyId, id);
    if (!['PENDING_APPROVAL', 'APPROVED'].includes(instruction.status)) throw new ConflictError('Only instructions that have not been submitted to a provider can be cancelled.');
    if (await PayrollPaymentBatchItemModel.findOne({ where: { companyId, instructionId: id } })) throw new ConflictError('An instruction already attached to a batch cannot be cancelled.');

    instruction.status = 'CANCELLED';
    instruction.updatedAt = new Date().toISOString();
    await PayrollPaymentInstructionModel.update({ status: 'CANCELLED', updatedAt: new Date() }, { where: { companyId, id } });
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.instruction.cancelled',
      entityType: 'payment_instruction',
      entityId: instruction.id,
      after: { status: instruction.status },
    });

    return instruction;
  }

  async setInstructionBeneficiary(companyId: number, actorUserId: number, id: string, input: { name: string; accountNumber: string; bankCode: string }) {
    const instruction = await this.getInstruction(companyId, id);
    if (!['PENDING_APPROVAL', 'APPROVED'].includes(instruction.status)) throw new ConflictError('Beneficiary details cannot be changed after provider submission.');
    if (await PayrollPaymentBatchItemModel.findOne({ where: { companyId, instructionId: id } })) throw new ConflictError('Beneficiary details cannot be changed after the instruction is added to a batch.');
    const beneficiarySnapshot = {
      name: input.name, bankCode: input.bankCode, accountNumberCiphertext: this.encryptAccount(input.accountNumber), accountFingerprint: input.accountNumber.slice(-4),
    };
    await PayrollPaymentInstructionModel.update({ beneficiarySnapshot, status: 'PENDING_APPROVAL', updatedAt: new Date() }, { where: { companyId, id } });
    const cached = this.instructions.find((item) => item.companyId === companyId && item.id === id);
    if (cached) {
      cached.beneficiary = { name: input.name, bankCode: input.bankCode, accountNumber: this.maskAccount(beneficiarySnapshot.accountFingerprint) };
      cached.status = 'PENDING_APPROVAL';
    }
    const safe = { name: input.name, bankCode: input.bankCode, accountNumber: this.maskAccount(beneficiarySnapshot.accountFingerprint) };
    await this.audit.record({ companyId, actorUserId, action: 'payments.instruction.beneficiary-updated', entityType: 'payment_instruction', entityId: id, after: { bankCode: input.bankCode, accountFingerprint: beneficiarySnapshot.accountFingerprint } });
    return { ...instruction, beneficiary: safe, updatedAt: new Date().toISOString() };
  }

  async listInstructionHistory(companyId: number, id: string) {
    const instruction = await this.getInstruction(companyId, id);
    const history = await AuditLogModel.findAll({ where: { companyId, entityType: 'payment_instruction', entityId: id }, order: [['createdAt', 'ASC'], ['id', 'ASC']] });
    return {
      instruction,
      events: history.map((event) => ({ type: event.action, actorUserId: event.actorUserId, at: event.createdAt, before: event.before, after: event.after })),
    };
  }

  async listBatches(companyId: number, query: { page: number; limit: number; status?: string }) {
    const result = await PayrollPaymentBatchModel.findAndCountAll({ where: { companyId, ...(query.status ? { status: query.status } : {}) }, order: [['createdAt', 'DESC']], limit: query.limit, offset: (query.page - 1) * query.limit });
    const batches = result.rows.map((item) => item.get({ plain: true }) as PaymentBatch);
    for (const batch of batches) batch.items = (await PayrollPaymentBatchItemModel.findAll({ where: { companyId, batchId: batch.id }, order: [['createdAt', 'ASC']] })).map((item) => item.get({ plain: true }) as PaymentBatchItem);
    return { page: query.page, limit: query.limit, total: result.count, data: batches };
  }

  async createBatch(companyId: number, actorUserId: number, input: { code: string; sourceAccountId: string; description?: string }) {
    const account = await this.getBankAccount(companyId, input.sourceAccountId);
    if (account.status !== 'VERIFIED') throw new ConflictError('A verified company bank account is required for a payment batch.');
    const batch: PaymentBatch = {
      id: randomUUID(),
      companyId,
      code: input.code,
      sourceAccountId: input.sourceAccountId,
      totalAmount: '0.00',
      currency: account.currency,
      status: 'DRAFT',
      description: input.description,
      createdBy: actorUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [],
    };

    this.batches.push(batch);
    await PayrollPaymentBatchModel.create({
      ...batch,
      createdBy: actorUserId,
      currency: account.currency,
      items: undefined,
    });
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.batch.created',
      entityType: 'payment_batch',
      entityId: batch.id,
      after: { code: batch.code, totalAmount: batch.totalAmount },
    });

    return batch;
  }

  async getBatch(companyId: number, id: string) {
    const persisted = await PayrollPaymentBatchModel.findOne({ where: { companyId, id } });
    if (persisted) {
      const batch = persisted.get({ plain: true }) as PaymentBatch;
      batch.items = (await PayrollPaymentBatchItemModel.findAll({ where: { companyId, batchId: batch.id }, order: [['createdAt', 'ASC']] })).map((item) => item.get({ plain: true }) as PaymentBatchItem);
      return batch;
    }
    const batch = this.batches.find((item) => item.companyId === companyId && item.id === id);
    if (!batch) throw new NotFoundError('Payment batch');
    return batch;
  }

  async addBatchItem(companyId: number, actorUserId: number, batchId: string, input: { instructionId: string; amount: number | string }) {
    const batch = await this.getBatch(companyId, batchId);
    if (batch.status !== 'DRAFT') throw new ConflictError('Only draft batches can be changed.');
    const instruction = await this.getInstruction(companyId, input.instructionId);
    if (instruction.status !== 'APPROVED' && instruction.status !== 'PENDING_APPROVAL') {
      throw new ConflictError('Only approved or pending payment instructions can be added to a batch.');
    }
    if (instruction.currency !== batch.currency) throw new ConflictError('A payment batch cannot mix currencies.');

    const amount = this.normalizeAmount(input.amount);
    if (amount !== instruction.amount) throw new ConflictError('Partial or overpaid batch items are not allowed. Use the exact payroll instruction amount.');
    if (batch.items.some((entry) => entry.instructionId === instruction.id) || await PayrollPaymentBatchItemModel.findOne({ where: { companyId, instructionId: instruction.id } })) {
      throw new ConflictError('A payment instruction may only be included once in an active batch.');
    }
    const item: PaymentBatchItem = {
      id: randomUUID(),
      batchId: batch.id,
      instructionId: instruction.id,
      amount,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    batch.items.push(item);
    await PayrollPaymentBatchItemModel.create({ companyId, ...item });
    batch.totalAmount = this.normalizeAmount(
      this.sumAmounts(batch.items.map((entry) => entry.amount)),
    );
    batch.updatedAt = new Date().toISOString();
    await PayrollPaymentBatchModel.update({ totalAmount: batch.totalAmount, updatedAt: new Date() }, { where: { companyId, id: batch.id, status: 'DRAFT' } });

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.batch.item-added',
      entityType: 'payment_batch_item',
      entityId: item.id,
      after: { batchId: batch.id, instructionId: instruction.id, amount },
    });

    return item;
  }

  async validateBatch(companyId: number, actorUserId: number, batchId: string) {
    const batch = await this.getBatch(companyId, batchId);
    if (batch.status !== 'DRAFT') throw new ConflictError('Only draft batches can be validated.');
    if (batch.items.length === 0) {
      throw new ConflictError('A batch must contain at least one payment instruction before validation.');
    }

    batch.status = 'VALIDATED';
    batch.updatedAt = new Date().toISOString();
    batch.items.forEach((item) => {
      item.status = 'VALIDATED';
    });
    await PayrollPaymentBatchModel.update({ status: 'VALIDATED', totalAmount: batch.totalAmount, updatedAt: new Date() }, { where: { companyId, id: batch.id, status: 'DRAFT' } });
    await PayrollPaymentBatchItemModel.update({ status: 'VALIDATED', updatedAt: new Date() }, { where: { companyId, batchId: batch.id } });

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.batch.validated',
      entityType: 'payment_batch',
      entityId: batch.id,
      after: { totalAmount: batch.totalAmount, itemCount: batch.items.length },
    });

    return batch;
  }

  async submitBatch(companyId: number, actorUserId: number, batchId: string) {
    const batch = await this.getBatch(companyId, batchId);
    if (batch.status !== 'VALIDATED') {
      throw new ConflictError('Only validated batches can be submitted for approval.');
    }

    batch.status = 'SUBMITTED';
    batch.updatedAt = new Date().toISOString();
    await PayrollPaymentBatchModel.update({ status: 'SUBMITTED', updatedAt: new Date() }, { where: { companyId, id: batch.id, status: 'VALIDATED' } });
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.batch.submitted',
      entityType: 'payment_batch',
      entityId: batch.id,
    });

    return batch;
  }

  async approveBatch(companyId: number, actorUserId: number, batchId: string, reason?: string) {
    const batch = await this.getBatch(companyId, batchId);
    if (batch.status !== 'SUBMITTED') {
      throw new ConflictError('Only submitted batches can be approved.');
    }
    if (batch.createdBy === actorUserId) throw new ConflictError('The batch creator cannot approve the same payment batch.');

    const transaction = await sequelize.transaction();
    try {
      const current = await PayrollPaymentBatchModel.findOne({ where: { companyId, id: batch.id, status: 'SUBMITTED' }, transaction, lock: transaction.LOCK.UPDATE });
      if (!current) throw new ConflictError('Payment batch has already changed state. Reload before approving.');
      if (await PayrollPaymentApprovalModel.findOne({ where: { companyId, batchId: batch.id, actorUserId }, transaction })) throw new ConflictError('This user has already decided on the payment batch.');
      await PayrollPaymentApprovalModel.create({
        id: randomUUID(), companyId, batchId: batch.id, actorUserId, decision: 'APPROVED', reason: reason ?? null, decidedAt: new Date(),
      }, { transaction });
      const policy = await PayrollPaymentPolicyModel.findOne({ where: { companyId, active: true }, transaction });
      const threshold = policy?.get('highValueThreshold');
      const highValue = !!threshold && BigInt(this.normalizeAmount(String(batch.totalAmount)).replace('.', '')) >= BigInt(this.normalizeAmount(String(threshold)).replace('.', ''));
      const required = highValue ? Number(policy?.get('highValueApprovals') ?? Math.max(Number(policy?.get('baseApprovals') ?? 1), 2)) : Number(policy?.get('baseApprovals') ?? 1);
      const received = await PayrollPaymentApprovalModel.count({ where: { companyId, batchId: batch.id, decision: 'APPROVED' }, transaction });
      const approved = received >= required;
      const [updated] = await PayrollPaymentBatchModel.update({ ...(approved ? { status: 'APPROVED', approvedBy: actorUserId, approvedAt: new Date() } : {}), updatedAt: new Date() }, { where: { companyId, id: batch.id, status: 'SUBMITTED' }, transaction });
      if (!updated) throw new ConflictError('Payment batch has already changed state. Reload before approving.');
      if (approved) await PayrollPaymentInstructionModel.update({ status: 'APPROVED', updatedAt: new Date() }, { where: { companyId, id: batch.items.map((item) => item.instructionId) }, transaction });
      await transaction.commit();
      batch.status = approved ? 'APPROVED' : 'SUBMITTED';
      batch.approvedBy = approved ? actorUserId : undefined;
      batch.items.forEach((item) => { item.status = approved ? 'APPROVED' : 'SUBMITTED'; });
      (batch as any).approvalProgress = { required, received, approved };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    batch.updatedAt = new Date().toISOString();

    await this.audit.record({
      companyId,
      actorUserId,
      action: batch.status === 'APPROVED' ? 'payments.batch.approved' : 'payments.batch.approval-recorded',
      entityType: 'payment_batch',
      entityId: batch.id,
      after: { reason: reason ?? null, status: batch.status, approvalProgress: (batch as any).approvalProgress },
    });

    return batch;
  }

  async rejectBatch(companyId: number, actorUserId: number, batchId: string, reason?: string) {
    const batch = await this.getBatch(companyId, batchId);
    if (!['DRAFT', 'VALIDATED', 'SUBMITTED'].includes(batch.status)) throw new ConflictError('A batch cannot be rejected after approval or submission to a provider.');

    batch.status = 'REJECTED';
    batch.updatedAt = new Date().toISOString();
    await PayrollPaymentBatchModel.update({ status: 'REJECTED', updatedAt: new Date() }, { where: { companyId, id: batch.id, status: ['DRAFT', 'VALIDATED', 'SUBMITTED'] } });
    await PayrollPaymentInstructionModel.update({ status: 'REJECTED', updatedAt: new Date() }, { where: { companyId, id: batch.items.map((item) => item.instructionId), status: ['PENDING_APPROVAL', 'APPROVED'] } });
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.batch.rejected',
      entityType: 'payment_batch',
      entityId: batch.id,
      after: { reason: reason ?? null },
    });

    return batch;
  }

  async executeBatch(companyId: number, actorUserId: number, batchId: string, providerId: string) {
    const batch = await this.getBatch(companyId, batchId);
    if (batch.status !== 'APPROVED') {
      throw new ConflictError('Only approved batches can be executed.');
    }
    const approvals = await PayrollPaymentApprovalModel.findAll({ where: { companyId, batchId: batch.id, decision: 'APPROVED' } });
    if (approvals.some((approval) => Number(approval.get('actorUserId')) === actorUserId)) throw new ConflictError('A batch approver cannot execute the same payment batch.');
    const sourceAccount = await this.getBankAccount(companyId, batch.sourceAccountId);
    if (sourceAccount.status !== 'VERIFIED') throw new ConflictError('The approved source account is no longer verified; the batch must be reviewed and approved again.');

    const provider = this.providerAdapters.find((item) => item.id === providerId);
    const providerConfig = await PayrollPaymentProviderConfigModel.findOne({ where: { companyId, providerId, status: 'ACTIVE' } });
    if (!provider || !providerConfig) throw new ConflictError('A real, tenant-configured payment provider adapter is required. Batch execution was not submitted.');

    const work = [] as Array<{ item: PaymentBatchItem; instruction: PaymentInstruction; beneficiary: { name: string; accountNumber: string; bankCode: string }; idempotencyKey: string }>;
    for (const item of batch.items) {
      const instruction = await this.getInstruction(companyId, item.instructionId);
      const beneficiary = await this.loadBeneficiary(companyId, instruction.id);
      if (!beneficiary) throw new ConflictError(`Payment instruction ${instruction.id} has no beneficiary details.`);
      const idempotencyKey = `${instruction.idempotencyKey}:${providerId}`;
      if (await PayrollPaymentOrderModel.findOne({ where: { companyId, idempotencyKey } })) throw new ConflictError('An order already exists for this instruction. Verify its provider status before retrying.');
      work.push({ item, instruction, beneficiary, idempotencyKey });
    }

    batch.status = 'PROCESSING';
    batch.updatedAt = new Date().toISOString();
    const [claimed] = await PayrollPaymentBatchModel.update({ status: 'PROCESSING', updatedAt: new Date() }, { where: { companyId, id: batch.id, status: 'APPROVED' } });
    if (!claimed) throw new ConflictError('Payment batch was claimed by another execution.');

    const outcomes: PaymentStatus[] = [];
    for (const { item, instruction, beneficiary, idempotencyKey } of work) {
      const order: PaymentOrder = {
        id: randomUUID(), companyId, batchId: batch.id, instructionId: instruction.id, providerId,
        amount: item.amount, currency: instruction.currency, status: 'SUBMITTED', idempotencyKey,
        submittedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      const request = { companyId, orderId: order.id, idempotencyKey, amount: order.amount, currency: order.currency, beneficiary };
      const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      await PayrollPaymentOrderModel.create({ ...order, createdBy: actorUserId });
      const attempt = await PayrollPaymentAttemptModel.create({ id: randomUUID(), companyId, orderId: order.id, attemptNumber: 1, status: 'SUBMITTED', requestHash, startedAt: new Date() });
      await PayrollPaymentInstructionModel.update({ status: 'SUBMITTED', updatedAt: new Date() }, { where: { companyId, id: instruction.id } });
      this.orders.push(order);
      try {
        const submission = await provider.submitTransfer(request);
        if (!submission.providerReference?.trim() || (submission.status === 'SETTLED' && !submission.settledAt)) throw new PaymentSubmissionUnknownError('Provider response omitted settlement details; query the provider before retrying.');
        await this.applyProviderSubmission(companyId, order, submission, false);
        outcomes.push(submission.status);
        item.status = submission.status;
      } catch (error) {
        const unknown = error instanceof PaymentSubmissionUnknownError || (error as { code?: string }).code === 'ETIMEDOUT';
        order.status = unknown ? 'SUBMISSION_UNKNOWN' : 'FAILED';
        outcomes.push(order.status);
        item.status = order.status === 'SUBMISSION_UNKNOWN' ? 'SUBMISSION_UNKNOWN' : 'FAILED';
        await PayrollPaymentBatchItemModel.update({ status: item.status, updatedAt: new Date() }, { where: { companyId, id: item.id } });
        await PayrollPaymentOrderModel.update({ status: order.status, updatedAt: new Date() }, { where: { companyId, id: order.id } });
        await PayrollPaymentInstructionModel.update({ status: order.status, updatedAt: new Date() }, { where: { companyId, id: instruction.id } });
        await attempt.update({ status: order.status, errorCode: unknown ? 'SUBMISSION_UNKNOWN' : 'PROVIDER_REJECTED', completedAt: new Date() });
      }
    }

    batch.status = outcomes.every((status) => status === 'SETTLED') ? 'SETTLED'
      : outcomes.every((status) => status === 'FAILED') ? 'FAILED'
      : outcomes.some((status) => status === 'SUBMISSION_UNKNOWN') ? 'SUBMISSION_UNKNOWN'
      : outcomes.some((status) => status === 'FAILED') ? 'PARTIALLY_SETTLED'
      : 'PROCESSING';
    batch.updatedAt = new Date().toISOString();
    await PayrollPaymentBatchModel.update({ status: batch.status, updatedAt: new Date() }, { where: { companyId, id: batch.id } });

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.batch.executed',
      entityType: 'payment_batch',
      entityId: batch.id,
      after: { providerId, orderCount: batch.items.length },
    });

    return batch;
  }

  async listOrders(companyId: number) {
    return (await PayrollPaymentOrderModel.findAll({ where: { companyId }, order: [['createdAt', 'DESC']] })).map((row) => row.get({ plain: true }));
  }

  async getOrder(companyId: number, id: string) {
    const persisted = await PayrollPaymentOrderModel.findOne({ where: { companyId, id } });
    if (persisted) return persisted.get({ plain: true }) as PaymentOrder;
    const order = this.orders.find((item) => item.companyId === companyId && item.id === id);
    if (!order) throw new NotFoundError('Payment order');
    return order;
  }

  async executeOrder(companyId: number, actorUserId: number, orderId: string, input: { providerId: string; paymentMethod: PaymentMethod }) {
    const order = await this.getOrder(companyId, orderId);
    if (order.status === 'SETTLED' || order.status === 'RECONCILED') {
      throw new ConflictError('An already settled or reconciled order cannot be resubmitted.');
    }
    const provider = this.providerAdapters.find((item) => item.id === input.providerId);
    const config = await PayrollPaymentProviderConfigModel.findOne({ where: { companyId, providerId: input.providerId, status: 'ACTIVE' } });
    if (!provider || !config) {
      throw new ConflictError('A real, tenant-configured payment provider adapter is required. Order execution was not submitted.');
    }

    if (order.status === 'SUBMISSION_UNKNOWN') throw new ConflictError('Submission status must be queried from the provider before retrying.');
    const instruction = await this.getInstruction(companyId, order.instructionId);
    const beneficiary = await this.loadBeneficiary(companyId, instruction.id);
    if (!beneficiary) throw new ConflictError('Payment instruction has no beneficiary details.');
    const request = { companyId, orderId: order.id, idempotencyKey: order.idempotencyKey, amount: order.amount, currency: order.currency, beneficiary };
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const attemptNumber = (await PayrollPaymentAttemptModel.count({ where: { companyId, orderId: order.id } })) + 1;
    const attempt = await PayrollPaymentAttemptModel.create({ id: randomUUID(), companyId, orderId: order.id, attemptNumber, status: 'SUBMITTED', requestHash, startedAt: new Date() });
    order.providerId = input.providerId;
    order.status = 'SUBMITTED';
    order.updatedAt = new Date().toISOString();
    order.submittedAt = order.submittedAt ?? new Date().toISOString();
    await PayrollPaymentOrderModel.update({ providerId: input.providerId, status: 'SUBMITTED', submittedAt: order.submittedAt, updatedAt: new Date() }, { where: { companyId, id: order.id } });
    await PayrollPaymentInstructionModel.update({ status: 'SUBMITTED', updatedAt: new Date() }, { where: { companyId, id: instruction.id } });
    try {
      const submission = await provider.submitTransfer(request);
      if (!submission.providerReference?.trim() || (submission.status === 'SETTLED' && !submission.settledAt)) throw new PaymentSubmissionUnknownError('Provider response omitted settlement details; query the provider before retrying.');
      await this.applyProviderSubmission(companyId, order, submission);
    } catch (error) {
      const unknown = error instanceof PaymentSubmissionUnknownError || (error as { code?: string }).code === 'ETIMEDOUT';
      order.status = unknown ? 'SUBMISSION_UNKNOWN' : 'FAILED';
      await PayrollPaymentOrderModel.update({ status: order.status, updatedAt: new Date() }, { where: { companyId, id: order.id } });
      await PayrollPaymentInstructionModel.update({ status: order.status, updatedAt: new Date() }, { where: { companyId, id: instruction.id } });
      await attempt.update({ status: order.status, errorCode: unknown ? 'SUBMISSION_UNKNOWN' : 'PROVIDER_REJECTED', completedAt: new Date() });
      if (!unknown) throw error;
    }

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.order.submitted',
      entityType: 'payment_order',
      entityId: order.id,
      after: { providerId: order.providerId, status: order.status },
    });

    return order;
  }

  async refreshOrderStatus(companyId: number, actorUserId: number, orderId: string) {
    const order = await this.getOrder(companyId, orderId);
    const provider = this.providerAdapters.find((item) => item.id === order.providerId);
    const config = await PayrollPaymentProviderConfigModel.findOne({ where: { companyId, providerId: order.providerId, status: 'ACTIVE' } });
    if (!provider || !config || !provider.getTransferStatus) throw new ConflictError('The configured provider does not support status queries.');
    const attempts = await PayrollPaymentAttemptModel.findAll({ where: { companyId, orderId }, order: [['attemptNumber', 'DESC']], limit: 1 });
    const providerReference = attempts[0]?.get('providerReference') as string | undefined;
    const submission = await provider.getTransferStatus({ companyId, orderId, idempotencyKey: order.idempotencyKey, providerReference });
    const transaction = await this.applyProviderSubmission(companyId, order, submission);
    await this.audit.record({ companyId, actorUserId, action: 'payments.order.status-refreshed', entityType: 'payment_order', entityId: orderId, after: { status: submission.status, providerReference: submission.providerReference } });
    return transaction;
  }

  async listOrderAttempts(companyId: number, orderId: string) {
    const order = await this.getOrder(companyId, orderId);
    const attempts = await PayrollPaymentAttemptModel.findAll({ where: { companyId, orderId: order.id }, order: [['attemptNumber', 'ASC']] });
    return { order, attempts: attempts.map((row) => row.get({ plain: true })) };
  }

  async listTransactions(companyId: number) {
    return (await PayrollPaymentTransactionModel.findAll({ where: { companyId }, order: [['createdAt', 'DESC']] })).map((row) => row.get({ plain: true }));
  }

  async getTransaction(companyId: number, id: string) {
    const persisted = await PayrollPaymentTransactionModel.findOne({ where: { companyId, id } });
    if (persisted) return persisted.get({ plain: true }) as PaymentTransaction;
    const transaction = this.transactions.find((item) => item.companyId === companyId && item.id === id);
    if (!transaction) throw new NotFoundError('Payment transaction');
    return transaction;
  }

  async reconcileTransaction(companyId: number, actorUserId: number, transactionId: string, input: { reference: string; externalAmount: string; externalCurrency: string; notes?: string }) {
    const externalAmount = this.normalizeAmount(input.externalAmount);
    const externalCurrency = input.externalCurrency.toUpperCase();
    const existing = await PayrollPaymentReconciliationModel.findOne({ where: { companyId, reference: input.reference } });
    if (existing) {
      if (String(existing.get('transactionId')) === transactionId && String(existing.get('externalAmount')) === externalAmount && String(existing.get('externalCurrency')) === externalCurrency) return existing.get({ plain: true });
      throw new ConflictError('Reconciliation reference has already been used with different payment data.');
    }
    const transaction = await PayrollPaymentTransactionModel.findOne({ where: { companyId, id: transactionId } });
    if (!transaction) throw new NotFoundError('Payment transaction');
    const internalAmount = this.normalizeAmount(String(transaction.get('amount')));
    const exact = internalAmount === externalAmount && String(transaction.get('currency')) === externalCurrency;
    const reconciliation = await PayrollPaymentReconciliationModel.create({
      id: randomUUID(), companyId, transactionId, statementEntryId: null, reference: input.reference,
      externalAmount, externalCurrency, reconciledBy: actorUserId,
      status: exact ? 'MATCHED' : 'RECONCILIATION_EXCEPTION', notes: input.notes ?? null,
    });
    if (exact) await PayrollPaymentTransactionModel.update({ status: 'RECONCILED', updatedAt: new Date() }, { where: { companyId, id: transactionId } });
    if (exact) {
      await PayrollPaymentOrderModel.update({ status: 'RECONCILED', updatedAt: new Date() }, { where: { companyId, id: transaction.get('orderId') } });
      const order = await PayrollPaymentOrderModel.findOne({ where: { companyId, id: transaction.get('orderId') } });
      if (order) await PayrollPaymentInstructionModel.update({ status: 'RECONCILED', updatedAt: new Date() }, { where: { companyId, id: order.get('instructionId') } });
    }
    await this.audit.record({ companyId, actorUserId, action: exact ? 'payments.transaction.reconciled' : 'payments.transaction.reconciliation-exception', entityType: 'payment_reconciliation', entityId: reconciliation.get('id') as string, after: { transactionId, externalAmount, externalCurrency, status: exact ? 'MATCHED' : 'RECONCILIATION_EXCEPTION' } });
    return reconciliation.get({ plain: true });
  }

  async confirmTransaction(companyId: number, actorUserId: number, id: string, input: { status: PaymentStatus; providerReference?: string }) {
    void companyId; void actorUserId; void id; void input;
    throw new ConflictError('Settlement status can only be applied from a verified provider callback or a matched bank statement.');
  }

  async registerFailure(companyId: number, actorUserId: number, orderId: string, reason: string) {
    const order = await this.getOrder(companyId, orderId);
    order.status = 'FAILED';
    order.updatedAt = new Date().toISOString();

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.order.failed',
      entityType: 'payment_order',
      entityId: order.id,
      after: { reason },
    });

    return order;
  }

  async registerReturn(companyId: number, actorUserId: number, transactionId: string, input: { amount: number | string; currency?: string; reason: string }) {
    const transaction = await this.getTransaction(companyId, transactionId);
    const amount = this.normalizeAmount(input.amount);
    const currency = (input.currency ?? transaction.currency).toUpperCase();
    if (currency !== transaction.currency) throw new ConflictError('A return must use the original payment currency.');
    const existingReturns = await PayrollPaymentReturnModel.findAll({ where: { companyId, transactionId } });
    const returned = existingReturns.reduce((sum, row) => sum + BigInt(this.normalizeAmount(String(row.get('amount'))).replace('.', '')), 0n);
    const original = BigInt(this.normalizeAmount(transaction.amount).replace('.', ''));
    const next = BigInt(amount.replace('.', ''));
    if (next <= 0n || returned + next > original) throw new ConflictError('Return amount must be positive and cannot exceed the unpaid transaction balance.');
    const record: PaymentReturn = {
      id: randomUUID(),
      companyId,
      transactionId,
      amount,
      currency,
      reason: input.reason,
      returnedAt: new Date().toISOString(),
    };

    this.returns.push(record);
    transaction.status = returned + next === original ? 'RETURNED' : 'PARTIALLY_SETTLED';
    transaction.updatedAt = new Date().toISOString();
    await PayrollPaymentReturnModel.create({ ...record, providerReference: transaction.providerReference });
    await PayrollPaymentTransactionModel.update({ status: transaction.status, updatedAt: new Date() }, { where: { companyId, id: transactionId } });
    const order = await PayrollPaymentOrderModel.findOne({ where: { companyId, id: transaction.orderId } });
    if (order) {
      await order.update({ status: transaction.status, updatedAt: new Date() });
      await PayrollPaymentInstructionModel.update({ status: transaction.status, updatedAt: new Date() }, { where: { companyId, id: order.get('instructionId') } });
    }

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.transaction.returned',
      entityType: 'payment_return',
      entityId: record.id,
      after: { transactionId, amount: record.amount, reason: input.reason },
    });

    return record;
  }

  async listReturns(companyId: number) {
    return (await PayrollPaymentReturnModel.findAll({ where: { companyId }, order: [['returnedAt', 'DESC']] })).map((row) => row.get({ plain: true }));
  }

  async listBankAccounts(companyId: number) {
    const rows = await PayrollPaymentBankAccountModel.findAll({ where: { companyId }, order: [['createdAt', 'DESC']] });
    if (rows.length) return rows.map((row) => {
      const account = row.get({ plain: true }) as any;
      return { id: account.id, companyId, bankCode: account.bankCode, accountName: account.accountName, accountIdentifier: this.maskAccount(account.accountFingerprint), fingerprint: account.accountFingerprint, currency: account.currency, status: account.status, isPrimary: account.isPrimary, createdAt: account.createdAt, updatedAt: account.updatedAt } as CompanyBankAccount;
    });
    return this.bankAccounts.filter((item) => item.companyId === companyId);
  }

  async registerBankAccount(companyId: number, actorUserId: number, input: { bankCode: string; accountName: string; accountIdentifier: string; currency?: string; isPrimary?: boolean }) {
    const encrypted = this.encryptAccount(input.accountIdentifier);
    const fingerprint = input.accountIdentifier.slice(-4);
    const account: CompanyBankAccount = {
      id: randomUUID(),
      companyId,
      bankCode: input.bankCode,
      accountName: input.accountName,
      accountIdentifier: this.maskAccount(fingerprint),
      fingerprint,
      currency: input.currency ?? 'AOA',
      status: 'PENDING_VERIFICATION',
      isPrimary: input.isPrimary ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (account.isPrimary) {
      await PayrollPaymentBankAccountModel.update({ isPrimary: false }, { where: { companyId } });
      this.bankAccounts.filter((item) => item.companyId === companyId).forEach((item) => { item.isPrimary = false; });
    }
    this.bankAccounts.push(account);
    await PayrollPaymentBankAccountModel.create({ ...account, accountCiphertext: encrypted, accountFingerprint: fingerprint });
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.bank-account.registered',
      entityType: 'company_bank_account',
      entityId: account.id,
      after: { bankCode: account.bankCode, accountFingerprint: account.fingerprint },
    });

    return account;
  }

  async getBankAccount(companyId: number, id: string) {
    const persisted = await PayrollPaymentBankAccountModel.findOne({ where: { companyId, id } });
    if (persisted) {
      const row = persisted.get({ plain: true }) as any;
      return { id: row.id, companyId, bankCode: row.bankCode, accountName: row.accountName, accountIdentifier: this.maskAccount(row.accountFingerprint), fingerprint: row.accountFingerprint, currency: row.currency, status: row.status, isPrimary: row.isPrimary, createdAt: row.createdAt, updatedAt: row.updatedAt } as CompanyBankAccount;
    }
    const account = this.bankAccounts.find((item) => item.companyId === companyId && item.id === id);
    if (!account) throw new NotFoundError('Bank account');
    return account;
  }

  async updateBankAccount(companyId: number, actorUserId: number, id: string, input: { bankCode?: string; accountName?: string; accountIdentifier?: string; currency?: string; isPrimary?: boolean }) {
    const account = await this.getBankAccount(companyId, id);
    const detailsChanged = !!(input.accountIdentifier || input.bankCode || input.accountName || input.currency);
    const encrypted = input.accountIdentifier ? this.encryptAccount(input.accountIdentifier) : undefined;
    const fingerprint = input.accountIdentifier?.slice(-4);
    Object.assign(account, {
      ...(input.bankCode ? { bankCode: input.bankCode } : {}),
      ...(input.accountName ? { accountName: input.accountName } : {}),
      ...(input.accountIdentifier ? { accountIdentifier: this.maskAccount(fingerprint!), fingerprint } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(detailsChanged ? { status: 'PENDING_VERIFICATION' as const } : {}),
      ...(typeof input.isPrimary === 'boolean' ? { isPrimary: input.isPrimary } : {}),
      updatedAt: new Date().toISOString(),
    });
    await PayrollPaymentBankAccountModel.update({
      ...(input.bankCode ? { bankCode: input.bankCode } : {}), ...(input.accountName ? { accountName: input.accountName } : {}),
      ...(encrypted ? { accountCiphertext: encrypted, accountFingerprint: fingerprint } : {}), ...(input.currency ? { currency: input.currency } : {}),
      ...(typeof input.isPrimary === 'boolean' ? { isPrimary: input.isPrimary } : {}), ...(detailsChanged ? { status: 'PENDING_VERIFICATION' } : {}), updatedAt: new Date(),
    }, { where: { companyId, id } });
    if (input.isPrimary === true) {
      await PayrollPaymentBankAccountModel.update({ isPrimary: false }, { where: { companyId, id: { [Op.ne]: id } } });
      this.bankAccounts.filter((item) => item.companyId === companyId && item.id !== id).forEach((item) => { item.isPrimary = false; });
    }
    if (detailsChanged) {
      const approvedBatches = await PayrollPaymentBatchModel.findAll({ where: { companyId, sourceAccountId: id, status: 'APPROVED' } });
      const approvedBatchIds = approvedBatches.map((batch) => batch.get('id'));
      await PayrollPaymentBatchModel.update({ status: 'VALIDATED', approvedBy: null, approvedAt: null, updatedAt: new Date() }, { where: { companyId, sourceAccountId: id, status: 'APPROVED' } });
      if (approvedBatchIds.length) await PayrollPaymentApprovalModel.destroy({ where: { companyId, batchId: approvedBatchIds } });
      this.batches.filter((batch) => batch.companyId === companyId && batch.sourceAccountId === id && batch.status === 'APPROVED').forEach((batch) => {
        batch.status = 'VALIDATED'; batch.approvedBy = undefined;
        batch.items.forEach((item) => { item.status = 'VALIDATED'; });
      });
    }

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.bank-account.updated',
      entityType: 'company_bank_account',
      entityId: account.id,
      after: { bankCode: account.bankCode, accountFingerprint: account.fingerprint },
    });

    return account;
  }

  async verifyBankAccount(companyId: number, actorUserId: number, id: string) {
    const account = await this.getBankAccount(companyId, id);
    account.status = 'VERIFIED';
    account.updatedAt = new Date().toISOString();
    await PayrollPaymentBankAccountModel.update({ status: 'VERIFIED', updatedAt: new Date() }, { where: { companyId, id } });

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.bank-account.verified',
      entityType: 'company_bank_account',
      entityId: account.id,
      after: { status: account.status },
    });

    return account;
  }

  listProviders() {
    return this.providerAdapters.map((provider) => ({
      id: provider.id, name: provider.name, type: provider.type,
      capabilities: [...(provider.capabilities ?? []), ...(provider.getTransferStatus ? ['STATUS_QUERY'] : [])],
    }));
  }

  async configureProvider(companyId: number, actorUserId: number, input: { providerId: string; providerType: 'BANK' | 'GATEWAY' | 'FILE_PROVIDER'; status?: 'ACTIVE' | 'INACTIVE' | 'PENDING'; endpoint?: string; capabilities?: string[] }) {
    if ((input.status ?? 'ACTIVE') === 'ACTIVE' && !this.providerAdapters.some((provider) => provider.id === input.providerId)) {
      throw new ConflictError('This provider has no installed adapter and cannot be activated.');
    }
    const config: ProviderConfiguration = {
      id: randomUUID(),
      companyId,
      providerId: input.providerId,
      providerType: input.providerType,
      status: input.status ?? 'ACTIVE',
      endpoint: input.endpoint,
      capabilities: input.capabilities ?? [...(this.providerAdapters.find((provider) => provider.id === input.providerId)?.capabilities ?? []), ...(this.providerAdapters.find((provider) => provider.id === input.providerId)?.getTransferStatus ? ['STATUS_QUERY'] : [])],
      createdAt: new Date().toISOString(),
    };

    this.providerConfigurations.push(config);
    await PayrollPaymentProviderConfigModel.upsert({ ...config, credentialSecretRef: null });
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.provider.configured',
      entityType: 'payment_provider_configuration',
      entityId: config.id,
      after: { providerId: config.providerId, status: config.status },
    });

    return config;
  }

  listProviderConfigurations(companyId: number) {
    return PayrollPaymentProviderConfigModel.findAll({ where: { companyId }, order: [['createdAt', 'DESC']] }).then((rows) => rows.map((row) => row.get({ plain: true })));
  }

  async getPaymentPolicy(companyId: number) {
    const policy = await PayrollPaymentPolicyModel.findOne({ where: { companyId, active: true } });
    return policy?.get({ plain: true }) ?? { companyId, baseApprovals: 1, highValueThreshold: null, highValueApprovals: null, active: true };
  }

  async configurePaymentPolicy(companyId: number, actorUserId: number, input: { baseApprovals: number; highValueThreshold?: string; highValueApprovals?: number }) {
    if (input.highValueThreshold && !input.highValueApprovals) throw new ConflictError('High-value approvals must be configured together with their amount threshold.');
    if (!input.highValueThreshold && input.highValueApprovals) throw new ConflictError('A high-value amount threshold is required for additional approvals.');
    const values = {
      baseApprovals: input.baseApprovals,
      highValueThreshold: input.highValueThreshold ? this.normalizeAmount(input.highValueThreshold) : null,
      highValueApprovals: input.highValueApprovals ?? null,
      active: true,
    };
    const [policy] = await PayrollPaymentPolicyModel.findOrCreate({ where: { companyId }, defaults: { id: randomUUID(), companyId, ...values } });
    if (policy.get('baseApprovals') !== values.baseApprovals || policy.get('highValueThreshold') !== values.highValueThreshold || policy.get('highValueApprovals') !== values.highValueApprovals) await policy.update(values);
    await this.audit.record({ companyId, actorUserId, action: 'payments.policy.updated', entityType: 'payment_policy', entityId: String(policy.get('id')), after: values });
    return policy.get({ plain: true });
  }

  async generateBankFile(_companyId: number, _actorUserId: number, _input: { format: 'PDF' | 'CSV' | 'XLSX'; reportType: string }) {
    throw new ConflictError('A bank-specific export format must be supplied by the configured payment provider adapter before a bank file can be generated.');
  }

  async importStatement(companyId: number, actorUserId: number, input: {
    sourceAccountId: string; fileName: string; fileHash?: string;
    entries: Array<{ externalReference: string; transactionDate: string; amount: string; currency: string; direction: 'DEBIT' | 'CREDIT'; description?: string }>;
  }) {
    const account = await this.getBankAccount(companyId, input.sourceAccountId);
    if (account.status !== 'VERIFIED') throw new ConflictError('A verified company bank account is required to import a statement.');
    if (input.entries.some((entry) => entry.currency.toUpperCase() !== account.currency)) throw new ConflictError('All bank statement rows must use the source account currency.');
    const serialized = JSON.stringify({ sourceAccountId: input.sourceAccountId, entries: input.entries });
    const computedFileHash = createHash('sha256').update(serialized).digest('hex');
    if (input.fileHash && input.fileHash.toLowerCase() !== computedFileHash) throw new ConflictError('Statement file hash does not match its contents.');
    const fileHash = computedFileHash;
    const duplicate = await PayrollPaymentStatementImportModel.findOne({ where: { companyId, fileHash } });
    if (duplicate) return duplicate.get({ plain: true });
    const record = {
      id: randomUUID(),
      companyId,
      sourceAccountId: input.sourceAccountId,
      fileName: input.fileName,
      fileHash,
      rowCount: input.entries.length,
      status: 'IMPORTED',
      importedBy: actorUserId,
      createdAt: new Date().toISOString(),
    };

    await PayrollPaymentStatementImportModel.create(record);
    await PayrollPaymentStatementEntryModel.bulkCreate(input.entries.map((entry) => ({
      id: randomUUID(), companyId, importId: record.id, externalReference: entry.externalReference,
      transactionDate: entry.transactionDate, amount: this.normalizeAmount(entry.amount), currency: entry.currency.toUpperCase(),
      direction: entry.direction, description: entry.description ?? null, matchedTransactionId: null,
    })));

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.bank-statement.imported',
      entityType: 'bank_statement_import',
      entityId: record.id,
      after: { sourceAccountId: record.sourceAccountId, importedRecords: record.rowCount, fileHash },
    });

    return record;
  }

  async listReconciliations(companyId: number) {
    const rows = await PayrollPaymentReconciliationModel.findAll({ where: { companyId }, order: [['createdAt', 'DESC']] });
    return rows.map((row) => row.get({ plain: true }));
  }

  async runReconciliation(companyId: number, actorUserId: number, reference: string) {
    const entryModel = await PayrollPaymentStatementEntryModel.findOne({ where: { companyId, externalReference: reference } });
    if (!entryModel) throw new NotFoundError('Bank statement entry');
    const existingReconciliation = await PayrollPaymentReconciliationModel.findOne({ where: { companyId, reference } });
    if (existingReconciliation) return existingReconciliation.get({ plain: true });
    const entry = entryModel.get({ plain: true }) as any;
    const matchingTransaction = await PayrollPaymentTransactionModel.findOne({ where: { companyId, providerReference: reference } });
    const exact = !!matchingTransaction
      && this.normalizeAmount(String(matchingTransaction.get('amount'))) === this.normalizeAmount(String(entry.amount))
      && String(matchingTransaction.get('currency')) === String(entry.currency)
      && entry.direction === 'DEBIT';
    if (matchingTransaction && exact) {
      await PayrollPaymentTransactionModel.update({ status: 'RECONCILED', settledAt: entry.transactionDate, updatedAt: new Date() }, { where: { companyId, id: matchingTransaction.get('id') } });
      await PayrollPaymentOrderModel.update({ status: 'RECONCILED', updatedAt: new Date() }, { where: { companyId, id: matchingTransaction.get('orderId') } });
      const order = await PayrollPaymentOrderModel.findOne({ where: { companyId, id: matchingTransaction.get('orderId') } });
      if (order) await PayrollPaymentInstructionModel.update({ status: 'RECONCILED', updatedAt: new Date() }, { where: { companyId, id: order.get('instructionId') } });
    }
    const reconciliation: PaymentReconciliation = {
      id: randomUUID(),
      companyId,
      transactionId: matchingTransaction ? String(matchingTransaction.get('id')) : null,
      reference,
      externalAmount: this.normalizeAmount(String(entry.amount)),
      externalCurrency: String(entry.currency),
      reconciledBy: actorUserId.toString(),
      status: exact ? 'MATCHED' : 'RECONCILIATION_EXCEPTION',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await PayrollPaymentReconciliationModel.create({
      id: reconciliation.id, companyId, statementEntryId: entry.id, transactionId: matchingTransaction?.get('id') ?? null,
      reference, externalAmount: reconciliation.externalAmount, externalCurrency: reconciliation.externalCurrency,
      reconciledBy: actorUserId, status: reconciliation.status, notes: null, evidence: null,
    });
    if (matchingTransaction && exact) await PayrollPaymentStatementEntryModel.update({ matchedTransactionId: matchingTransaction.get('id') }, { where: { companyId, id: entry.id } });
    this.reconciliations.push(reconciliation);
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.reconciliation.started',
      entityType: 'payment_reconciliation',
      entityId: reconciliation.id,
      after: { reference, status: reconciliation.status },
    });

    return reconciliation;
  }

  async resolveReconciliationException(companyId: number, actorUserId: number, id: string, input: { notes: string; evidence: string[] }) {
    if (!input.notes.trim() || input.evidence.length === 0) throw new ConflictError('Resolution requires a reason and supporting evidence reference.');
    const reconciliation = this.reconciliations.find((item) => item.companyId === companyId && item.id === id);
    const persisted = await PayrollPaymentReconciliationModel.findOne({ where: { companyId, id } });
    if (!reconciliation && !persisted) throw new NotFoundError('Payment reconciliation');
    if (persisted && persisted.get('status') !== 'RECONCILIATION_EXCEPTION') throw new ConflictError('Only reconciliation exceptions can be resolved.');

    if (reconciliation) {
      reconciliation.status = 'RESOLVED';
      reconciliation.notes = input.notes;
      reconciliation.updatedAt = new Date().toISOString();
    }
    await PayrollPaymentReconciliationModel.update({ status: 'RESOLVED', notes: input.notes, evidence: input.evidence, resolvedBy: actorUserId, resolvedAt: new Date(), updatedAt: new Date() }, { where: { companyId, id, status: 'RECONCILIATION_EXCEPTION' } });

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.reconciliation.resolved',
      entityType: 'payment_reconciliation',
      entityId: id,
      after: { status: 'RESOLVED', notes: input.notes, evidenceCount: input.evidence.length },
    });

    return reconciliation ? { ...reconciliation, notes: input.notes } : persisted!.get({ plain: true });
  }

  async getSummary(companyId: number): Promise<PaymentSummaryReport> {
    const instructions = await PayrollPaymentInstructionModel.findAll({ where: { companyId, status: { [Op.notIn]: ['CANCELLED', 'REJECTED'] } } });
    const transactions = await PayrollPaymentTransactionModel.findAll({ where: { companyId } });
    const totalAuthorized = this.sumAmounts(instructions.map((item) => String(item.get('amount'))));
    const totalConfirmed = this.sumAmounts(transactions.filter((item) => ['SETTLED', 'RECONCILED'].includes(String(item.get('status')))).map((item) => String(item.get('amount'))));
    return {
      totalAuthorized,
      totalConfirmed,
      pendingPayments: transactions.filter((item) => ['PROCESSING', 'SUBMITTED', 'SUBMISSION_UNKNOWN'].includes(String(item.get('status')))).length,
      failedPayments: transactions.filter((item) => ['FAILED', 'RETURNED', 'PARTIALLY_SETTLED'].includes(String(item.get('status')))).length,
    };
  }

  async settlementReport(companyId: number) {
    return (await PayrollPaymentTransactionModel.findAll({ where: { companyId, status: ['SETTLED', 'RECONCILED'] }, order: [['settledAt', 'DESC']] })).map((row) => row.get({ plain: true }));
  }

  async failedReport(companyId: number) {
    return (await PayrollPaymentTransactionModel.findAll({ where: { companyId, status: ['FAILED', 'RETURNED', 'PARTIALLY_SETTLED'] }, order: [['updatedAt', 'DESC']] })).map((row) => row.get({ plain: true }));
  }

  async reconciliationReport(companyId: number) {
    return this.listReconciliations(companyId);
  }

  async exportReport(companyId: number, actorUserId: number, input: { format: 'PDF' | 'CSV' | 'XLSX'; reportType: 'summary' | 'settlements' | 'failed' | 'returns' | 'reconciliation' }) {
    if (input.format !== 'CSV') throw new ConflictError('Only CSV report export is currently available; PDF and XLSX renderers are not configured.');
    const report = input.reportType === 'summary' ? [await this.getSummary(companyId)]
      : input.reportType === 'settlements' ? await this.settlementReport(companyId)
      : input.reportType === 'failed' ? await this.failedReport(companyId)
      : input.reportType === 'returns' ? await this.listReturns(companyId)
      : await this.reconciliationReport(companyId);
    const content = this.toCsv(report as unknown as Array<Record<string, unknown>>);
    const file = { id: randomUUID(), companyId, format: 'CSV' as const, reportType: input.reportType,
      fileName: `payments-${input.reportType}-${new Date().toISOString().slice(0, 10)}.csv`, contentType: 'text/csv; charset=utf-8', content, createdAt: new Date().toISOString() };

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.report.exported',
      entityType: 'payment_report_export',
      entityId: file.id,
      after: { format: file.format, reportType: file.reportType },
    });

    return file;
  }

  private normalizeAmount(amount: number | string): string {
    const raw = String(amount).trim();
    if (!/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(raw)) {
      throw new ConflictError('Invalid financial value.');
    }
    const [whole, fraction = ''] = raw.split('.');
    return `${whole}.${fraction.padEnd(2, '0')}`;
  }

  private encryptAccount(value: string): string {
    const configured = process.env.PAYMENTS_PII_ENCRYPTION_KEY;
    if (!configured || !/^[a-fA-F0-9]{64}$/.test(configured)) {
      throw new ConflictError('PAYMENTS_PII_ENCRYPTION_KEY must be configured as a 32-byte hexadecimal secret before registering bank accounts.');
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(configured, 'hex'), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
  }

  private decryptAccount(value: string): string {
    const configured = process.env.PAYMENTS_PII_ENCRYPTION_KEY;
    if (!configured || !/^[a-fA-F0-9]{64}$/.test(configured)) throw new ConflictError('PAYMENTS_PII_ENCRYPTION_KEY is not configured.');
    const [ivHex, tagHex, ciphertextHex] = value.split(':');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(configured, 'hex'), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]).toString('utf8');
  }

  private maskAccount(fingerprint: string): string {
    return `••••${fingerprint}`;
  }

  private presentInstruction(row: any): PaymentInstruction {
    const snapshot = row.beneficiarySnapshot;
    const { beneficiarySnapshot: _snapshot, ...safe } = row;
    return {
      ...safe,
      beneficiary: snapshot ? { name: snapshot.name, bankCode: snapshot.bankCode, accountNumber: this.maskAccount(snapshot.accountFingerprint) } : undefined,
    } as PaymentInstruction;
  }

  private async applyProviderSubmission(companyId: number, order: PaymentOrder, submission: PaymentProviderSubmission, updateBatch = true) {
    if (!submission.providerReference?.trim() || (submission.status === 'SETTLED' && !submission.settledAt)) {
      throw new PaymentSubmissionUnknownError('Provider status response is incomplete; query the provider before retrying.');
    }
    const existing = await PayrollPaymentTransactionModel.findOne({ where: { companyId, providerReference: submission.providerReference } });
    if (existing && existing.get('orderId') !== order.id) throw new ConflictError('Provider reference is already linked to another payment order.');
    const updatedAt = new Date();
    if (existing) {
      await existing.update({ status: submission.status, settledAt: submission.settledAt ?? null, updatedAt });
    } else {
      await PayrollPaymentTransactionModel.create({
        id: randomUUID(), companyId, orderId: order.id, providerReference: submission.providerReference,
        amount: order.amount, currency: order.currency, status: submission.status,
        settledAt: submission.settledAt ?? null, providerPayloadHash: null,
      });
    }
    order.status = submission.status;
    order.updatedAt = updatedAt.toISOString();
    await PayrollPaymentOrderModel.update({ status: submission.status, updatedAt }, { where: { companyId, id: order.id } });
    await PayrollPaymentInstructionModel.update({ status: submission.status, updatedAt }, { where: { companyId, id: order.instructionId } });
    const attempt = await PayrollPaymentAttemptModel.findOne({ where: { companyId, orderId: order.id }, order: [['attemptNumber', 'DESC']] });
    if (attempt) await attempt.update({ status: submission.status, providerReference: submission.providerReference, completedAt: updatedAt });
    if (order.batchId && updateBatch) {
      const items = await PayrollPaymentBatchItemModel.findAll({ where: { companyId, batchId: order.batchId } });
      const orders = await PayrollPaymentOrderModel.findAll({ where: { companyId, batchId: order.batchId } });
      const states = orders.map((item) => String(item.get('status')));
      const batchStatus: PaymentBatch['status'] = states.length && states.every((status) => status === 'SETTLED') ? 'SETTLED'
        : states.length && states.every((status) => status === 'FAILED') ? 'FAILED'
        : states.some((status) => status === 'SUBMISSION_UNKNOWN') ? 'SUBMISSION_UNKNOWN'
        : states.some((status) => status === 'FAILED') ? 'PARTIALLY_SETTLED' : 'PROCESSING';
      await PayrollPaymentBatchModel.update({ status: batchStatus, updatedAt }, { where: { companyId, id: order.batchId } });
      for (const item of items) {
        const associatedOrder = orders.find((candidate) => candidate.get('instructionId') === item.get('instructionId'));
        if (associatedOrder) await item.update({ status: associatedOrder.get('status'), updatedAt });
      }
    }
    return PayrollPaymentTransactionModel.findOne({ where: { companyId, providerReference: submission.providerReference } }).then((row) => row?.get({ plain: true }));
  }

  private async loadBeneficiary(companyId: number, instructionId: string): Promise<{ name: string; accountNumber: string; bankCode: string } | undefined> {
    const row = await PayrollPaymentInstructionModel.findOne({ where: { companyId, id: instructionId } });
    const snapshot = row?.get('beneficiarySnapshot') as any;
    if (!snapshot?.accountNumberCiphertext) return undefined;
    return { name: snapshot.name, bankCode: snapshot.bankCode, accountNumber: this.decryptAccount(snapshot.accountNumberCiphertext) };
  }

  private toCsv(rows: Array<Record<string, unknown>>): string {
    if (rows.length === 0) return '';
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return [headers.map(cell).join(','), ...rows.map((row) => headers.map((key) => cell(row[key])).join(','))].join('\r\n');
  }

  private sumAmounts(values: Array<number | string>): string {
    const cents = values.reduce((sum, value) => sum + BigInt(this.normalizeAmount(value).replace('.', '')), 0n);
    return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
  }
}
