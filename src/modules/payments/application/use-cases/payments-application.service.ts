import {
  PaymentPersistencePort,
  PaymentSourcesPort,
  PaymentBatchRecord,
} from '../ports/payment-persistence.port';
import { RecordFilter as Op } from '../../../../shared/application/ports/record-store.port';
import { PersistenceConflictError } from '../../../../shared/application/ports/persistence-conflict.error';
import type {
  PaymentStatus,
  PaymentType,
  PaymentMethod,
  PaymentInstruction,
  PaymentBatchItem,
  PaymentBatch,
  PaymentOrder,
  PaymentTransaction,
  PaymentReconciliation,
  PaymentReturn,
  PaymentSummaryReport,
} from '../../domain/payments.contracts';
export type {
  PaymentStatus,
  PaymentType,
  PaymentMethod,
  PaymentInstruction,
  PaymentBatchItem,
  PaymentBatch,
  PaymentOrder,
  PaymentTransaction,
  PaymentReconciliation,
  PaymentReturn,
  PaymentSummaryReport,
} from '../../domain/payments.contracts';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { ConflictError, NotFoundError } from '../../../../shared/errors/app.error';

import {
  PaymentProviderPort,
  PaymentProviderSubmission,
  PaymentSubmissionUnknownError,
} from '../ports/payment-provider.port';

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
  constructor(
    private readonly audit: AuditRecorderPort,
    private readonly providerAdapters: readonly PaymentProviderPort[],
    private readonly persistence: PaymentPersistencePort,
    private readonly sources: PaymentSourcesPort,
  ) {}

  async listInstructions(
    companyId: number,
    query: { page: number; limit: number; status?: string },
  ) {
    const result = await this.persistence.instruction.findAndCountAll({
      where: { companyId, ...(query.status ? { status: query.status } : {}) },
      order: [['createdAt', 'DESC']],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
    return {
      page: query.page,
      limit: query.limit,
      total: result.count,
      data: result.rows.map((item) => this.presentInstruction(item as any)),
    };
  }

  async createInstruction(
    companyId: number,
    actorUserId: number,
    input: CreatePaymentInstructionInput,
  ) {
    const payrollResult = await this.sources.results.findOne({
      where: { companyId, id: input.payrollResultId, employeeId: input.employeeId },
    });
    if (!payrollResult) throw new NotFoundError('Closed payroll result');
    const result = payrollResult as any;
    const run = await this.sources.runs.findOne({ where: { companyId, id: result.runId } });
    if (!run || run.status !== 'CLOSED' || run.runType === 'SIMULATION') {
      throw new ConflictError(
        'Payment instructions can only be created from a closed, non-simulation payroll run.',
      );
    }
    const amount = this.normalizeAmount(String(result.netAmount));
    if (BigInt(amount.replace('.', '')) <= 0n) {
      throw new ConflictError(
        'Zero or negative payroll results cannot be paid as a regular payment instruction.',
      );
    }
    if (input.amount !== undefined && this.normalizeAmount(input.amount) !== amount) {
      throw new ConflictError('Payment amount must match the closed payroll result exactly.');
    }
    if (input.currency && input.currency.toUpperCase() !== String(result.currency).toUpperCase()) {
      throw new ConflictError('Payment currency must match the closed payroll result.');
    }
    if (input.method && input.method !== 'BANK_TRANSFER')
      throw new ConflictError(
        'Only bank transfer execution is enabled for payroll payment instructions.',
      );
    const paymentTypeByRun: Record<string, PaymentType> = {
      REGULAR: 'REGULAR_SALARY',
      OFF_CYCLE: 'OFF_CYCLE',
      SUPPLEMENTARY: 'SUPPLEMENTARY',
      RETROACTIVE: 'RETROACTIVE',
      CORRECTION: 'CORRECTION',
      TERMINATION: 'TERMINATION',
    };
    const paymentType = paymentTypeByRun[String(run.runType)] ?? 'REGULAR_SALARY';
    if (input.paymentType && input.paymentType !== paymentType)
      throw new ConflictError('Payment type must match the source payroll run.');
    const key = input.idempotencyKey ?? `payroll-result:${input.payrollResultId}`;
    const persisted = await this.persistence.instruction.findOne({
      where: { companyId, idempotencyKey: key },
    });
    if (persisted) {
      if (persisted.payrollResultId !== input.payrollResultId || persisted.employeeId !== input.employeeId)
        throw new ConflictError('The operation key belongs to another payroll result.');
      return this.presentInstruction(persisted);
    }
    const existingForResult = await this.persistence.instruction.findOne({
      where: { companyId, payrollResultId: input.payrollResultId },
    });
    if (existingForResult)
      throw new ConflictError('A payment instruction already exists for this payroll result.');
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
      beneficiary: input.beneficiary
        ? {
            ...input.beneficiary,
            accountNumber: this.maskAccount(input.beneficiary.accountNumber.slice(-4)),
          }
        : undefined,
      reason: input.reason,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await this.persistence.instruction.create({
        ...instruction,
        createdBy: actorUserId,
        beneficiarySnapshot: input.beneficiary
          ? {
              name: input.beneficiary.name,
              bankCode: input.beneficiary.bankCode,
              accountNumberCiphertext: this.encryptAccount(input.beneficiary.accountNumber),
              accountFingerprint: input.beneficiary.accountNumber.slice(-4),
            }
          : null,
      });
    } catch (error) {
      if (error instanceof PersistenceConflictError) {
        const raced = await this.persistence.instruction.findOne({
          where: { companyId, idempotencyKey: key },
        });
        if (raced && raced.payrollResultId === input.payrollResultId && raced.employeeId === input.employeeId)
          return this.presentInstruction(raced);
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
      after: {
        employeeId: instruction.employeeId,
        amount: instruction.amount,
        status: instruction.status,
      },
    });

    return instruction;
  }

  async getInstruction(companyId: number, id: string) {
    const persisted = await this.persistence.instruction.findOne({ where: { companyId, id } });
    if (persisted) return this.presentInstruction(persisted);
    const instruction = this.instructions.find(
      (item) => item.companyId === companyId && item.id === id,
    );
    if (!instruction) throw new NotFoundError('Payment instruction');
    return instruction;
  }

  async cancelInstruction(companyId: number, actorUserId: number, id: string) {
    const instruction = await this.getInstruction(companyId, id);
    if (!['PENDING_APPROVAL', 'APPROVED'].includes(instruction.status))
      throw new ConflictError(
        'Only instructions that have not been submitted to a provider can be cancelled.',
      );
    if (await this.persistence.batchItem.findOne({ where: { companyId, instructionId: id } }))
      throw new ConflictError('An instruction already attached to a batch cannot be cancelled.');

    instruction.status = 'CANCELLED';
    instruction.updatedAt = new Date().toISOString();
    await this.persistence.instruction.updateWhere(
      { status: 'CANCELLED', updatedAt: new Date() },
      { where: { companyId, id } },
    );
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

  async setInstructionBeneficiary(
    companyId: number,
    actorUserId: number,
    id: string,
    input: { name: string; accountNumber: string; bankCode: string },
  ) {
    const instruction = await this.getInstruction(companyId, id);
    if (!['PENDING_APPROVAL', 'APPROVED'].includes(instruction.status))
      throw new ConflictError('Beneficiary details cannot be changed after provider submission.');
    if (await this.persistence.batchItem.findOne({ where: { companyId, instructionId: id } }))
      throw new ConflictError(
        'Beneficiary details cannot be changed after the instruction is added to a batch.',
      );
    const beneficiarySnapshot = {
      name: input.name,
      bankCode: input.bankCode,
      accountNumberCiphertext: this.encryptAccount(input.accountNumber),
      accountFingerprint: input.accountNumber.slice(-4),
    };
    await this.persistence.instruction.updateWhere(
      { beneficiarySnapshot, status: 'PENDING_APPROVAL', updatedAt: new Date() },
      { where: { companyId, id } },
    );
    const cached = this.instructions.find((item) => item.companyId === companyId && item.id === id);
    if (cached) {
      cached.beneficiary = {
        name: input.name,
        bankCode: input.bankCode,
        accountNumber: this.maskAccount(beneficiarySnapshot.accountFingerprint),
      };
      cached.status = 'PENDING_APPROVAL';
    }
    const safe = {
      name: input.name,
      bankCode: input.bankCode,
      accountNumber: this.maskAccount(beneficiarySnapshot.accountFingerprint),
    };
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.instruction.beneficiary-updated',
      entityType: 'payment_instruction',
      entityId: id,
      after: {
        bankCode: input.bankCode,
        accountFingerprint: beneficiarySnapshot.accountFingerprint,
      },
    });
    return { ...instruction, status: 'PENDING_APPROVAL', beneficiary: safe, updatedAt: new Date().toISOString() };
  }

  async listInstructionHistory(companyId: number, id: string) {
    const instruction = await this.getInstruction(companyId, id);
    const history = await this.sources.history.findAll({
      where: { companyId, entityType: 'payment_instruction', entityId: id },
      order: [
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    return {
      instruction,
      events: history.map((event) => ({
        type: event.action,
        actorUserId: event.actorUserId,
        at: event.createdAt,
        before: event.before,
        after: event.after,
      })),
    };
  }

  private batchView(row: PaymentBatchRecord): PaymentBatch {
    return {
      id: row.id,
      companyId: row.companyId,
      code: row.code,
      sourceAccountId: row.sourceAccountId,
      totalAmount: String(row.totalAmount),
      currency: row.currency,
      status: row.status as PaymentBatch['status'],
      description: row.description ?? undefined,
      createdBy: row.createdBy,
      approvedBy: row.approvedBy ?? undefined,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
      items: [],
    };
  }
  async listBatches(companyId: number, query: { page: number; limit: number; status?: string }) {
    const result = await this.persistence.batch.findAndCountAll({
      where: { companyId, ...(query.status ? { status: query.status } : {}) },
      order: [['createdAt', 'DESC']],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
    const batches = result.rows.map((item) => this.batchView(item));
    for (const batch of batches)
      batch.items = (
        await this.persistence.batchItem.findAll({
          where: { companyId, batchId: batch.id },
          order: [['createdAt', 'ASC']],
        })
      ).map((item) => item as PaymentBatchItem);
    return { page: query.page, limit: query.limit, total: result.count, data: batches };
  }

  async createBatch(
    companyId: number,
    actorUserId: number,
    input: { code: string; sourceAccountId: string; description?: string },
  ) {
    const account = await this.getBankAccount(companyId, input.sourceAccountId);
    if (account.status !== 'VERIFIED')
      throw new ConflictError('A verified company bank account is required for a payment batch.');
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
    await this.persistence.batch.create({
      ...batch,
      createdBy: actorUserId,
      currency: account.currency,
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
    const persisted = await this.persistence.batch.findOne({ where: { companyId, id } });
    if (persisted) {
      const batch = this.batchView(persisted);
      batch.items = (
        await this.persistence.batchItem.findAll({
          where: { companyId, batchId: batch.id },
          order: [['createdAt', 'ASC']],
        })
      ).map((item) => item as PaymentBatchItem);
      return batch;
    }
    const batch = this.batches.find((item) => item.companyId === companyId && item.id === id);
    if (!batch) throw new NotFoundError('Payment batch');
    return batch;
  }

  async addBatchItem(
    companyId: number,
    actorUserId: number,
    batchId: string,
    input: { instructionId: string; amount: number | string },
  ) {
    const item = await this.persistence.withCompany(companyId, async transaction => {
      const batch = await this.persistence.batch.findOne({
        where: { companyId, id: batchId, status: 'DRAFT' }, transaction, forUpdate: true,
      });
      if (!batch) throw new ConflictError('Only draft batches can be changed.');
      const instruction = await this.persistence.instruction.findOne({
        where: { companyId, id: input.instructionId }, transaction, forUpdate: true,
      });
      if (!instruction || !['APPROVED', 'PENDING_APPROVAL'].includes(instruction.status))
        throw new ConflictError('Only approved or pending instructions can be included in a batch.');
      if (instruction.currency !== batch.currency)
        throw new ConflictError('A payment batch cannot mix currencies.');
      const amount = this.normalizeAmount(input.amount);
      if (amount !== this.normalizeAmount(instruction.amount))
        throw new ConflictError('Use the exact payroll instruction amount.');
      if (await this.persistence.batchItem.findOne({ where: { companyId, instructionId: instruction.id }, transaction }))
        throw new ConflictError('This payment instruction is already in a batch.');
      const item: PaymentBatchItem = {
        id: randomUUID(), batchId, instructionId: instruction.id, amount, status: 'PENDING',
        createdAt: new Date().toISOString(),
      };
      await this.persistence.batchItem.create({ companyId, ...item }, { transaction });
      await this.persistence.update(batch, { totalAmount: this.sumAmounts([batch.totalAmount, amount]), updatedAt: new Date() }, { transaction });
      return item;
    });
    await this.audit.record({
      companyId, actorUserId, action: 'payments.batch.item-added',
      entityType: 'payment_batch_item', entityId: item.id,
      after: { batchId, instructionId: item.instructionId, amount: item.amount },
    });
    return item;
  }

  async validateBatch(companyId: number, actorUserId: number, batchId: string) {
    const data = await this.persistence.withCompany(companyId, async transaction => {
      const batch = await this.persistence.batch.findOne({
        where: { companyId, id: batchId, status: 'DRAFT' }, transaction, forUpdate: true,
      });
      if (!batch) throw new ConflictError('Only draft batches can be validated.');
      const items = await this.persistence.batchItem.findAll({ where: { companyId, batchId }, transaction });
      if (!items.length) throw new ConflictError('Add at least one payment instruction before validation.');
      const account = await this.persistence.bankAccount.findOne({
        where: { companyId, id: batch.sourceAccountId, status: 'VERIFIED' }, transaction,
      });
      if (!account || account.currency !== batch.currency)
        throw new ConflictError('The source account must be verified and match the batch currency.');
      const totalAmount = this.sumAmounts(items.map(item => item.amount));
      await this.persistence.update(batch, { status: 'VALIDATED', totalAmount, updatedAt: new Date() }, { transaction });
      await this.persistence.batchItem.updateWhere({ status: 'VALIDATED', updatedAt: new Date() }, {
        where: { companyId, batchId }, transaction,
      });
      return { totalAmount, itemCount: items.length };
    });
    await this.audit.record({
      companyId, actorUserId, action: 'payments.batch.validated',
      entityType: 'payment_batch', entityId: batchId, after: data,
    });
    return this.getBatch(companyId, batchId);
  }

  async submitBatch(companyId: number, actorUserId: number, batchId: string) {
    const batch = await this.getBatch(companyId, batchId);
    if (batch.status !== 'VALIDATED') {
      throw new ConflictError('Only validated batches can be submitted for approval.');
    }

    batch.status = 'SUBMITTED';
    batch.updatedAt = new Date().toISOString();
    await this.persistence.batch.updateWhere(
      { status: 'SUBMITTED', updatedAt: new Date() },
      { where: { companyId, id: batch.id, status: 'VALIDATED' } },
    );
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
    if (batch.createdBy === actorUserId)
      throw new ConflictError('The batch creator cannot approve the same payment batch.');

    const { approved, required, received } = await this.persistence.withCompany(
      companyId,
      async (transaction) => {
        const current = await this.persistence.batch.findOne({
          where: { companyId, id: batch.id, status: 'SUBMITTED' },
          transaction,
          forUpdate: true,
        });
        if (!current)
          throw new ConflictError(
            'Payment batch has already changed state. Reload before approving.',
          );
        if (
          await this.persistence.approval.findOne({
            where: { companyId, batchId: batch.id, actorUserId },
            transaction,
          })
        )
          throw new ConflictError('This user has already decided on the payment batch.');
        await this.persistence.approval.create(
          {
            id: randomUUID(),
            companyId,
            batchId: batch.id,
            actorUserId,
            decision: 'APPROVED',
            reason: reason ?? null,
            decidedAt: new Date(),
          },
          { transaction },
        );
        const policy = await this.persistence.policy.findOne({
          where: { companyId, active: true },
          transaction,
        });
        const threshold = policy?.highValueThreshold;
        const highValue =
          !!threshold &&
          BigInt(this.normalizeAmount(String(batch.totalAmount)).replace('.', '')) >=
            BigInt(this.normalizeAmount(String(threshold)).replace('.', ''));
        const required = highValue
          ? Number(policy?.highValueApprovals ?? Math.max(Number(policy?.baseApprovals ?? 1), 2))
          : Number(policy?.baseApprovals ?? 1);
        const received = await this.persistence.approval.count({
          where: { companyId, batchId: batch.id, decision: 'APPROVED' },
          transaction,
        });
        const approved = received >= required;
        const updated = await this.persistence.batch.updateWhere(
          {
            ...(approved
              ? { status: 'APPROVED', approvedBy: actorUserId, approvedAt: new Date() }
              : {}),
            updatedAt: new Date(),
          },
          { where: { companyId, id: batch.id, status: 'SUBMITTED' }, transaction },
        );
        if (!updated)
          throw new ConflictError(
            'Payment batch has already changed state. Reload before approving.',
          );
        if (approved)
          await this.persistence.instruction.updateWhere(
            { status: 'APPROVED', updatedAt: new Date() },
            {
              where: { companyId, id: batch.items.map((item) => item.instructionId) },
              transaction,
            },
          );

        return { approved, required, received };
      },
    );
    batch.status = approved ? 'APPROVED' : 'SUBMITTED';
    batch.approvedBy = approved ? actorUserId : undefined;
    batch.items.forEach((item) => {
      item.status = approved ? 'APPROVED' : 'SUBMITTED';
    });
    (batch as any).approvalProgress = { required, received, approved };

    batch.updatedAt = new Date().toISOString();

    await this.audit.record({
      companyId,
      actorUserId,
      action:
        batch.status === 'APPROVED'
          ? 'payments.batch.approved'
          : 'payments.batch.approval-recorded',
      entityType: 'payment_batch',
      entityId: batch.id,
      after: {
        reason: reason ?? null,
        status: batch.status,
        approvalProgress: (batch as any).approvalProgress,
      },
    });

    return batch;
  }

  async rejectBatch(companyId: number, actorUserId: number, batchId: string, reason?: string) {
    const batch = await this.getBatch(companyId, batchId);
    if (!['DRAFT', 'VALIDATED', 'SUBMITTED'].includes(batch.status))
      throw new ConflictError(
        'A batch cannot be rejected after approval or submission to a provider.',
      );

    batch.status = 'REJECTED';
    batch.updatedAt = new Date().toISOString();
    await this.persistence.batch.updateWhere(
      { status: 'REJECTED', updatedAt: new Date() },
      { where: { companyId, id: batch.id, status: ['DRAFT', 'VALIDATED', 'SUBMITTED'] } },
    );
    await this.persistence.instruction.updateWhere(
      { status: 'REJECTED', updatedAt: new Date() },
      {
        where: {
          companyId,
          id: batch.items.map((item) => item.instructionId),
          status: ['PENDING_APPROVAL', 'APPROVED'],
        },
      },
    );
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
    const approvals = await this.persistence.approval.findAll({
      where: { companyId, batchId: batch.id, decision: 'APPROVED' },
    });
    if (approvals.some((approval) => Number(approval.actorUserId) === actorUserId))
      throw new ConflictError('A batch approver cannot execute the same payment batch.');
    const sourceAccount = await this.getBankAccount(companyId, batch.sourceAccountId);
    if (sourceAccount.status !== 'VERIFIED')
      throw new ConflictError(
        'The approved source account is no longer verified; the batch must be reviewed and approved again.',
      );

    const provider = this.providerAdapters.find((item) => item.id === providerId);
    const providerConfig = await this.persistence.providerConfig.findOne({
      where: { companyId, providerId, status: 'ACTIVE' },
    });
    if (!provider || !providerConfig)
      throw new ConflictError(
        'A real, tenant-configured payment provider adapter is required. Batch execution was not submitted.',
      );

    const work = [] as Array<{
      item: PaymentBatchItem;
      instruction: PaymentInstruction;
      beneficiary: { name: string; accountNumber: string; bankCode: string };
      idempotencyKey: string;
    }>;
    for (const item of batch.items) {
      const instruction = await this.getInstruction(companyId, item.instructionId);
      const beneficiary = await this.loadBeneficiary(companyId, instruction.id);
      if (!beneficiary)
        throw new ConflictError(
          `Payment instruction ${instruction.id} has no beneficiary details.`,
        );
      const idempotencyKey = `${instruction.idempotencyKey}:${providerId}`;
      if (await this.persistence.order.findOne({ where: { companyId, idempotencyKey } }))
        throw new ConflictError(
          'An order already exists for this instruction. Verify its provider status before retrying.',
        );
      work.push({ item, instruction, beneficiary, idempotencyKey });
    }

    const debitAccount = await this.providerSource(companyId, batch.sourceAccountId, batch.currency);
    batch.status = 'PROCESSING';
    batch.updatedAt = new Date().toISOString();
    const claimed = await this.persistence.batch.updateWhere(
      { status: 'PROCESSING', updatedAt: new Date() },
      { where: { companyId, id: batch.id, status: 'APPROVED' } },
    );
    if (!claimed) throw new ConflictError('Payment batch was claimed by another execution.');

    const outcomes: PaymentStatus[] = [];
    for (const { item, instruction, beneficiary, idempotencyKey } of work) {
      const order: PaymentOrder = {
        id: randomUUID(),
        companyId,
        batchId: batch.id,
        instructionId: instruction.id,
        providerId,
        amount: item.amount,
        currency: instruction.currency,
        status: 'SUBMITTED',
        idempotencyKey,
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const request = {
        companyId,
        orderId: order.id,
        idempotencyKey,
        amount: order.amount,
        currency: order.currency,
        sourceAccount: debitAccount,
        beneficiary,
      };
      const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      await this.persistence.order.create({ ...order, createdBy: actorUserId });
      const attempt = await this.persistence.attempt.create({
        id: randomUUID(),
        companyId,
        orderId: order.id,
        attemptNumber: 1,
        status: 'SUBMITTED',
        requestHash,
        startedAt: new Date(),
      });
      await this.persistence.instruction.updateWhere(
        { status: 'SUBMITTED', updatedAt: new Date() },
        { where: { companyId, id: instruction.id } },
      );
      this.orders.push(order);
      try {
        const submission = await provider.submitTransfer(request);
        if (
          !submission.providerReference?.trim() ||
          (submission.status === 'SETTLED' && !submission.settledAt)
        )
          throw new PaymentSubmissionUnknownError(
            'Provider response omitted settlement details; query the provider before retrying.',
          );
        await this.applyProviderSubmission(companyId, order, submission, false);
        outcomes.push(submission.status);
        item.status = submission.status;
      } catch (error) {
        const unknown =
          error instanceof PaymentSubmissionUnknownError ||
          (error as { code?: string }).code === 'ETIMEDOUT';
        order.status = unknown ? 'SUBMISSION_UNKNOWN' : 'FAILED';
        outcomes.push(order.status);
        item.status = order.status === 'SUBMISSION_UNKNOWN' ? 'SUBMISSION_UNKNOWN' : 'FAILED';
        await this.persistence.batchItem.updateWhere(
          { status: item.status, updatedAt: new Date() },
          { where: { companyId, id: item.id } },
        );
        await this.persistence.order.updateWhere(
          { status: order.status, updatedAt: new Date() },
          { where: { companyId, id: order.id } },
        );
        await this.persistence.instruction.updateWhere(
          { status: order.status, updatedAt: new Date() },
          { where: { companyId, id: instruction.id } },
        );
        await this.persistence.update(attempt, {
          status: order.status,
          errorCode: unknown ? 'SUBMISSION_UNKNOWN' : 'PROVIDER_REJECTED',
          completedAt: new Date(),
        });
      }
    }

    batch.status = outcomes.every((status) => status === 'SETTLED')
      ? 'SETTLED'
      : outcomes.every((status) => status === 'FAILED')
        ? 'FAILED'
        : outcomes.some((status) => status === 'SUBMISSION_UNKNOWN')
          ? 'SUBMISSION_UNKNOWN'
          : outcomes.some((status) => status === 'FAILED')
            ? 'PARTIALLY_SETTLED'
            : 'PROCESSING';
    batch.updatedAt = new Date().toISOString();
    await this.persistence.batch.updateWhere(
      { status: batch.status, updatedAt: new Date() },
      { where: { companyId, id: batch.id } },
    );

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
    return (
      await this.persistence.order.findAll({
        where: { companyId },
        order: [['createdAt', 'DESC']],
      })
    ).map((row) => row);
  }

  async getOrder(companyId: number, id: string) {
    const persisted = await this.persistence.order.findOne({ where: { companyId, id } });
    if (persisted) return persisted as PaymentOrder;
    const order = this.orders.find((item) => item.companyId === companyId && item.id === id);
    if (!order) throw new NotFoundError('Payment order');
    return order;
  }

  async executeOrder(
    companyId: number,
    actorUserId: number,
    orderId: string,
    input: { providerId: string; paymentMethod: PaymentMethod },
  ) {
    const order = await this.getOrder(companyId, orderId);
    if (order.status !== 'APPROVED' || order.providerId !== input.providerId || input.paymentMethod !== 'BANK_TRANSFER')
      throw new ConflictError('Only an approved order can be submitted to its original provider.');
    const provider = this.providerAdapters.find((item) => item.id === input.providerId);
    const config = await this.persistence.providerConfig.findOne({
      where: { companyId, providerId: input.providerId, status: 'ACTIVE' },
    });
    if (!provider || !config) {
      throw new ConflictError(
        'A real, tenant-configured payment provider adapter is required. Order execution was not submitted.',
      );
    }

    const instruction = await this.getInstruction(companyId, order.instructionId);
    const beneficiary = await this.loadBeneficiary(companyId, instruction.id);
    if (!beneficiary) throw new ConflictError('Payment instruction has no beneficiary details.');
    if (!order.batchId) throw new ConflictError('Execute payments from an approved batch.');
    const batch = await this.getBatch(companyId, order.batchId);
    const debitAccount = await this.providerSource(companyId, batch.sourceAccountId, order.currency);
    const approvers = await this.persistence.approval.findAll({ where: { companyId, batchId: batch.id, decision: 'APPROVED' } });
    if (approvers.some(row => Number(row.actorUserId) === actorUserId))
      throw new ConflictError('A batch approver cannot execute its payment orders.');
    const claimed = await this.persistence.order.updateWhere({ status: 'SUBMITTED', updatedAt: new Date() }, {
      where: { companyId, id: orderId, status: 'APPROVED', providerId: input.providerId },
    });
    if (!claimed) throw new ConflictError('The payment order changed before execution.');
    const request = {
      companyId,
      orderId: order.id,
      idempotencyKey: order.idempotencyKey,
      amount: order.amount,
      currency: order.currency,
      sourceAccount: debitAccount,
      beneficiary,
    };
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const attemptNumber =
      (await this.persistence.attempt.count({ where: { companyId, orderId: order.id } })) + 1;
    const attempt = await this.persistence.attempt.create({
      id: randomUUID(),
      companyId,
      orderId: order.id,
      attemptNumber,
      status: 'SUBMITTED',
      requestHash,
      startedAt: new Date(),
    });
    order.providerId = input.providerId;
    order.status = 'SUBMITTED';
    order.updatedAt = new Date().toISOString();
    order.submittedAt = order.submittedAt ?? new Date().toISOString();
    await this.persistence.order.updateWhere(
      {
        providerId: input.providerId,
        status: 'SUBMITTED',
        submittedAt: order.submittedAt,
        updatedAt: new Date(),
      },
      { where: { companyId, id: order.id } },
    );
    await this.persistence.instruction.updateWhere(
      { status: 'SUBMITTED', updatedAt: new Date() },
      { where: { companyId, id: instruction.id } },
    );
    try {
      const submission = await provider.submitTransfer(request);
      if (
        !submission.providerReference?.trim() ||
        (submission.status === 'SETTLED' && !submission.settledAt)
      )
        throw new PaymentSubmissionUnknownError(
          'Provider response omitted settlement details; query the provider before retrying.',
        );
      await this.applyProviderSubmission(companyId, order, submission);
    } catch (error) {
      const unknown =
        error instanceof PaymentSubmissionUnknownError ||
        (error as { code?: string }).code === 'ETIMEDOUT';
      order.status = unknown ? 'SUBMISSION_UNKNOWN' : 'FAILED';
      await this.persistence.order.updateWhere(
        { status: order.status, updatedAt: new Date() },
        { where: { companyId, id: order.id } },
      );
      await this.persistence.instruction.updateWhere(
        { status: order.status, updatedAt: new Date() },
        { where: { companyId, id: instruction.id } },
      );
      await this.persistence.update(attempt, {
        status: order.status,
        errorCode: unknown ? 'SUBMISSION_UNKNOWN' : 'PROVIDER_REJECTED',
        completedAt: new Date(),
      });
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
    if (!['SUBMITTED', 'PROCESSING', 'SUBMISSION_UNKNOWN'].includes(order.status))
      throw new ConflictError('Provider status queries are available for pending orders.');
    const provider = this.providerAdapters.find((item) => item.id === order.providerId);
    const config = await this.persistence.providerConfig.findOne({
      where: { companyId, providerId: order.providerId, status: 'ACTIVE' },
    });
    if (!provider || !config || !provider.getTransferStatus)
      throw new ConflictError('The configured provider does not support status queries.');
    const attempts = await this.persistence.attempt.findAll({
      where: { companyId, orderId },
      order: [['attemptNumber', 'DESC']],
      limit: 1,
    });
    const providerReference = attempts[0]?.providerReference as string | undefined;
    const submission = await provider.getTransferStatus({
      companyId,
      orderId,
      idempotencyKey: order.idempotencyKey,
      providerReference,
    });
    if (!submission.providerReference?.trim() || (submission.status === 'SETTLED' && !submission.settledAt))
      throw new ConflictError('The provider has not supplied valid settlement evidence.');
    const transaction = await this.applyProviderSubmission(companyId, order, submission);
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.order.status-refreshed',
      entityType: 'payment_order',
      entityId: orderId,
      after: { status: submission.status, providerReference: submission.providerReference },
    });
    return transaction;
  }

  async listOrderAttempts(companyId: number, orderId: string) {
    const order = await this.getOrder(companyId, orderId);
    const attempts = await this.persistence.attempt.findAll({
      where: { companyId, orderId: order.id },
      order: [['attemptNumber', 'ASC']],
    });
    return { order, attempts: attempts.map((row) => row) };
  }

  async listTransactions(companyId: number) {
    return (
      await this.persistence.transaction.findAll({
        where: { companyId },
        order: [['createdAt', 'DESC']],
      })
    ).map((row) => row);
  }

  async getTransaction(companyId: number, id: string) {
    const persisted = await this.persistence.transaction.findOne({ where: { companyId, id } });
    if (persisted) return persisted as PaymentTransaction;
    const transaction = this.transactions.find(
      (item) => item.companyId === companyId && item.id === id,
    );
    if (!transaction) throw new NotFoundError('Payment transaction');
    return transaction;
  }

  async reconcileTransaction(
    companyId: number,
    actorUserId: number,
    transactionId: string,
    input: { reference: string; externalAmount: string; externalCurrency: string; notes?: string },
  ) {
    return this.runReconciliation(companyId, actorUserId, input.reference, {
      transactionId, amount: this.normalizeAmount(input.externalAmount),
      currency: input.externalCurrency.toUpperCase(), notes: input.notes,
    });
  }

  async transactionEvidence(companyId: number, actorUserId: number, id: string) {
    const item = await this.persistence.transaction.findOne({ where: { companyId, id } });
    if (!item) throw new NotFoundError('Payment transaction');
    if (!['SETTLED', 'RECONCILED'].includes(item.status) || !item.providerReference || !item.settledAt)
      throw new ConflictError('A receipt requires a confirmed settlement with bank evidence.');
    await this.audit.record({
      companyId, actorUserId, action: 'payments.transaction.receipt-downloaded',
      entityType: 'payment_transaction', entityId: id,
    });
    return { id, orderId: item.orderId, amount: this.normalizeAmount(item.amount), currency: item.currency,
      reference: item.providerReference, settledAt: new Date(item.settledAt).toISOString(), status: item.status };
  }

  async confirmTransaction(
    companyId: number,
    actorUserId: number,
    id: string,
    input: { status: PaymentStatus; providerReference?: string },
  ) {
    void companyId;
    void actorUserId;
    void id;
    void input;
    throw new ConflictError(
      'Settlement status can only be applied from a verified provider callback or a matched bank statement.',
    );
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

  async registerReturn(
    companyId: number,
    actorUserId: number,
    transactionId: string,
    input: { amount: number | string; currency?: string; reason: string },
  ) {
    const transaction = await this.getTransaction(companyId, transactionId);
    const amount = this.normalizeAmount(input.amount);
    const currency = (input.currency ?? transaction.currency).toUpperCase();
    if (currency !== transaction.currency)
      throw new ConflictError('A return must use the original payment currency.');
    const existingReturns = await this.persistence.return.findAll({
      where: { companyId, transactionId },
    });
    const returned = existingReturns.reduce(
      (sum, row) => sum + BigInt(this.normalizeAmount(String(row.amount)).replace('.', '')),
      0n,
    );
    const original = BigInt(this.normalizeAmount(transaction.amount).replace('.', ''));
    const next = BigInt(amount.replace('.', ''));
    if (next <= 0n || returned + next > original)
      throw new ConflictError(
        'Return amount must be positive and cannot exceed the unpaid transaction balance.',
      );
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
    await this.persistence.return.create({
      ...record,
      providerReference: transaction.providerReference,
    });
    await this.persistence.transaction.updateWhere(
      { status: transaction.status, updatedAt: new Date() },
      { where: { companyId, id: transactionId } },
    );
    const order = await this.persistence.order.findOne({
      where: { companyId, id: transaction.orderId },
    });
    if (order) {
      await this.persistence.update(order, { status: transaction.status, updatedAt: new Date() });
      await this.persistence.instruction.updateWhere(
        { status: transaction.status, updatedAt: new Date() },
        { where: { companyId, id: order.instructionId } },
      );
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
    return (
      await this.persistence.return.findAll({
        where: { companyId },
        order: [['returnedAt', 'DESC']],
      })
    ).map((row) => row);
  }

  async listBankAccounts(companyId: number) {
    const rows = await this.persistence.bankAccount.findAll({
      where: { companyId },
      order: [['createdAt', 'DESC']],
    });
    if (rows.length)
      return rows.map((row) => {
        const account = row as any;
        return {
          id: account.id,
          companyId,
          bankCode: account.bankCode,
          accountName: account.accountName,
          accountIdentifier: this.maskAccount(account.accountFingerprint),
          fingerprint: account.accountFingerprint,
          currency: account.currency,
          status: account.status,
          isPrimary: account.isPrimary,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        } as CompanyBankAccount;
      });
    return this.bankAccounts.filter((item) => item.companyId === companyId);
  }

  async registerBankAccount(
    companyId: number,
    actorUserId: number,
    input: {
      bankCode: string;
      accountName: string;
      accountIdentifier: string;
      currency?: string;
      isPrimary?: boolean;
    },
  ) {
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
      await this.persistence.bankAccount.updateWhere(
        { isPrimary: false },
        { where: { companyId } },
      );
      this.bankAccounts
        .filter((item) => item.companyId === companyId)
        .forEach((item) => {
          item.isPrimary = false;
        });
    }
    this.bankAccounts.push(account);
    await this.persistence.bankAccount.create({
      ...account,
      accountCiphertext: encrypted,
      accountFingerprint: fingerprint,
    });
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
    const persisted = await this.persistence.bankAccount.findOne({ where: { companyId, id } });
    if (persisted) {
      const row = persisted as any;
      return {
        id: row.id,
        companyId,
        bankCode: row.bankCode,
        accountName: row.accountName,
        accountIdentifier: this.maskAccount(row.accountFingerprint),
        fingerprint: row.accountFingerprint,
        currency: row.currency,
        status: row.status,
        isPrimary: row.isPrimary,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } as CompanyBankAccount;
    }
    const account = this.bankAccounts.find(
      (item) => item.companyId === companyId && item.id === id,
    );
    if (!account) throw new NotFoundError('Bank account');
    return account;
  }

  async updateBankAccount(
    companyId: number,
    actorUserId: number,
    id: string,
    input: {
      bankCode?: string;
      accountName?: string;
      accountIdentifier?: string;
      currency?: string;
      isPrimary?: boolean;
    },
  ) {
    const account = await this.getBankAccount(companyId, id);
    const detailsChanged = !!(
      input.accountIdentifier ||
      input.bankCode ||
      input.accountName ||
      input.currency
    );
    const encrypted = input.accountIdentifier
      ? this.encryptAccount(input.accountIdentifier)
      : undefined;
    const fingerprint = input.accountIdentifier?.slice(-4);
    Object.assign(account, {
      ...(input.bankCode ? { bankCode: input.bankCode } : {}),
      ...(input.accountName ? { accountName: input.accountName } : {}),
      ...(input.accountIdentifier
        ? { accountIdentifier: this.maskAccount(fingerprint!), fingerprint }
        : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(detailsChanged ? { status: 'PENDING_VERIFICATION' as const } : {}),
      ...(typeof input.isPrimary === 'boolean' ? { isPrimary: input.isPrimary } : {}),
      updatedAt: new Date().toISOString(),
    });
    await this.persistence.bankAccount.updateWhere(
      {
        ...(input.bankCode ? { bankCode: input.bankCode } : {}),
        ...(input.accountName ? { accountName: input.accountName } : {}),
        ...(encrypted ? { accountCiphertext: encrypted, accountFingerprint: fingerprint } : {}),
        ...(input.currency ? { currency: input.currency } : {}),
        ...(typeof input.isPrimary === 'boolean' ? { isPrimary: input.isPrimary } : {}),
        ...(detailsChanged ? { status: 'PENDING_VERIFICATION' } : {}),
        updatedAt: new Date(),
      },
      { where: { companyId, id } },
    );
    if (input.isPrimary === true) {
      await this.persistence.bankAccount.updateWhere(
        { isPrimary: false },
        { where: { companyId, id: { [Op.ne]: id } } },
      );
      this.bankAccounts
        .filter((item) => item.companyId === companyId && item.id !== id)
        .forEach((item) => {
          item.isPrimary = false;
        });
    }
    if (detailsChanged) {
      const approvedBatches = await this.persistence.batch.findAll({
        where: { companyId, sourceAccountId: id, status: 'APPROVED' },
      });
      const approvedBatchIds = approvedBatches.map((batch) => batch.id);
      await this.persistence.batch.updateWhere(
        { status: 'VALIDATED', approvedBy: null, approvedAt: null, updatedAt: new Date() },
        { where: { companyId, sourceAccountId: id, status: 'APPROVED' } },
      );
      if (approvedBatchIds.length)
        await this.persistence.approval.destroy({
          where: { companyId, batchId: approvedBatchIds },
        });
      this.batches
        .filter(
          (batch) =>
            batch.companyId === companyId &&
            batch.sourceAccountId === id &&
            batch.status === 'APPROVED',
        )
        .forEach((batch) => {
          batch.status = 'VALIDATED';
          batch.approvedBy = undefined;
          batch.items.forEach((item) => {
            item.status = 'VALIDATED';
          });
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
    await this.persistence.bankAccount.updateWhere(
      { status: 'VERIFIED', updatedAt: new Date() },
      { where: { companyId, id } },
    );

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
      id: provider.id,
      name: provider.name,
      type: provider.type,
      capabilities: [
        ...(provider.capabilities ?? []),
        ...(provider.getTransferStatus ? ['STATUS_QUERY'] : []),
      ],
    }));
  }

  async executionProviders(companyId: number) {
    const configs = await this.persistence.providerConfig.findAll({ where: { companyId, status: 'ACTIVE' } });
    const allowed = new Set(configs.map(row => row.providerId));
    return this.listProviders().filter(provider => allowed.has(provider.id));
  }

  async configureProvider(
    companyId: number,
    actorUserId: number,
    input: {
      providerId: string;
      providerType: 'BANK' | 'GATEWAY' | 'FILE_PROVIDER';
      status?: 'ACTIVE' | 'INACTIVE' | 'PENDING';
      endpoint?: string;
      capabilities?: string[];
    },
  ) {
    if (
      (input.status ?? 'ACTIVE') === 'ACTIVE' &&
      !this.providerAdapters.some((provider) => provider.id === input.providerId)
    ) {
      throw new ConflictError('This provider has no installed adapter and cannot be activated.');
    }
    const config: ProviderConfiguration = {
      id: randomUUID(),
      companyId,
      providerId: input.providerId,
      providerType: input.providerType,
      status: input.status ?? 'ACTIVE',
      endpoint: input.endpoint,
      capabilities: input.capabilities ?? [
        ...(this.providerAdapters.find((provider) => provider.id === input.providerId)
          ?.capabilities ?? []),
        ...(this.providerAdapters.find((provider) => provider.id === input.providerId)
          ?.getTransferStatus
          ? ['STATUS_QUERY']
          : []),
      ],
      createdAt: new Date().toISOString(),
    };

    const saved = await this.persistence.withCompany(companyId, async transaction => {
      const current = await this.persistence.providerConfig.findOne({ where: { companyId, providerId: config.providerId }, transaction, forUpdate: true });
      if (current) return this.persistence.update(current, {
        providerType: config.providerType, status: config.status, capabilities: config.capabilities,
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      }, { transaction });
      return this.persistence.providerConfig.create({ ...config, credentialSecretRef: null }, { transaction });
    });
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.provider.configured',
      entityType: 'payment_provider_configuration',
      entityId: saved.id,
      after: { providerId: config.providerId, status: config.status },
    });

    const { credentialSecretRef, endpoint, ...safe } = saved;
    return safe;
  }

  listProviderConfigurations(companyId: number) {
    return this.persistence.providerConfig
      .findAll({
        where: { companyId },
        order: [['createdAt', 'DESC']],
      })
      .then((rows) => rows.map(({ credentialSecretRef, endpoint, ...row }) => row));
  }

  async getPaymentPolicy(companyId: number) {
    const policy = await this.persistence.policy.findOne({ where: { companyId, active: true } });
    return (
      policy ?? {
        companyId,
        baseApprovals: 1,
        highValueThreshold: null,
        highValueApprovals: null,
        active: true,
      }
    );
  }

  async configurePaymentPolicy(
    companyId: number,
    actorUserId: number,
    input: { baseApprovals: number; highValueThreshold?: string; highValueApprovals?: number },
  ) {
    if (input.highValueThreshold && !input.highValueApprovals)
      throw new ConflictError(
        'High-value approvals must be configured together with their amount threshold.',
      );
    if (!input.highValueThreshold && input.highValueApprovals)
      throw new ConflictError(
        'A high-value amount threshold is required for additional approvals.',
      );
    const values = {
      baseApprovals: input.baseApprovals,
      highValueThreshold: input.highValueThreshold
        ? this.normalizeAmount(input.highValueThreshold)
        : null,
      highValueApprovals: input.highValueApprovals ?? null,
      active: true,
    };
    const [policy] = await this.persistence.policy.findOrCreate({
      where: { companyId },
      defaults: { id: randomUUID(), companyId, ...values },
    });
    if (
      policy.baseApprovals !== values.baseApprovals ||
      policy.highValueThreshold !== values.highValueThreshold ||
      policy.highValueApprovals !== values.highValueApprovals
    )
      await this.persistence.update(policy, values);
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.policy.updated',
      entityType: 'payment_policy',
      entityId: String(policy.id),
      after: values,
    });
    return policy;
  }

  async generateBankFile(
    _companyId: number,
    _actorUserId: number,
    _input: { format: 'PDF' | 'CSV' | 'XLSX'; reportType: string },
  ) {
    throw new ConflictError(
      'A bank-specific export format must be supplied by the configured payment provider adapter before a bank file can be generated.',
    );
  }

  async importStatement(
    companyId: number,
    actorUserId: number,
    input: {
      sourceAccountId: string;
      fileName: string;
      fileHash?: string;
      entries: Array<{
        externalReference: string;
        transactionDate: string;
        amount: string;
        currency: string;
        direction: 'DEBIT' | 'CREDIT';
        description?: string;
      }>;
    },
  ) {
    const account = await this.getBankAccount(companyId, input.sourceAccountId);
    if (account.status !== 'VERIFIED')
      throw new ConflictError('A verified company bank account is required to import a statement.');
    if (input.entries.some((entry) => entry.currency.toUpperCase() !== account.currency))
      throw new ConflictError('All bank statement rows must use the source account currency.');
    const serialized = JSON.stringify({
      sourceAccountId: input.sourceAccountId,
      entries: input.entries,
    });
    const computedFileHash = createHash('sha256').update(serialized).digest('hex');
    if (input.fileHash && input.fileHash.toLowerCase() !== computedFileHash)
      throw new ConflictError('Statement file hash does not match its contents.');
    const fileHash = computedFileHash;
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

    const saved = await this.persistence.withCompany(companyId, async transaction => {
      const duplicate = await this.persistence.statementImport.findOne({ where: { companyId, fileHash }, transaction });
      if (duplicate) return duplicate;
      await this.persistence.statementImport.create(record, { transaction });
      await this.persistence.statementEntry.bulkCreate(
        input.entries.map((entry) => ({
        id: randomUUID(),
        companyId,
        importId: record.id,
        externalReference: entry.externalReference,
        transactionDate: entry.transactionDate,
        amount: this.normalizeAmount(entry.amount),
        currency: entry.currency.toUpperCase(),
        direction: entry.direction,
        description: entry.description ?? null,
        matchedTransactionId: null,
        })), { transaction },
      );
      return record;
    });
    if (saved.id !== record.id) return saved;

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.bank-statement.imported',
      entityType: 'bank_statement_import',
      entityId: record.id,
      after: {
        sourceAccountId: record.sourceAccountId,
        importedRecords: record.rowCount,
        fileHash,
      },
    });

    return record;
  }

  async listReconciliations(companyId: number) {
    const rows = await this.persistence.reconciliation.findAll({
      where: { companyId },
      order: [['createdAt', 'DESC']],
    });
    return rows.map((row) => row);
  }

  async getReconciliation(companyId: number, id: string) {
    const item = await this.persistence.reconciliation.findOne({ where: { companyId, id } });
    if (!item) throw new NotFoundError('Payment reconciliation');
    return item;
  }

  async runReconciliation(companyId: number, actorUserId: number, reference: string,
    expected?: { transactionId: string; amount: string; currency: string; notes?: string }) {
    const reconciliation = await this.persistence.withCompany(companyId, async transaction => {
      const entries = await this.persistence.statementEntry.findAll({
        where: { companyId, externalReference: reference }, limit: 2, transaction,
      });
      if (entries.length > 1) throw new ConflictError('This statement reference is ambiguous.');
      const entryModel = entries[0];
      if (!entryModel) throw new NotFoundError('Bank statement entry');
      if (expected && (this.normalizeAmount(entryModel.amount) !== expected.amount || entryModel.currency !== expected.currency))
        throw new ConflictError('Enter the amount and currency from the imported bank statement.');
      const existingReconciliation = await this.persistence.reconciliation.findOne({
        where: { companyId, reference }, transaction,
      });
      if (existingReconciliation) {
        if (expected && existingReconciliation.transactionId !== expected.transactionId)
          throw new ConflictError('This statement movement belongs to another transaction.');
        return existingReconciliation;
      }
      const entry = entryModel as any;
      const matchingTransaction = await this.persistence.transaction.findOne({
        where: { companyId, providerReference: reference, status: 'SETTLED' }, transaction, forUpdate: true,
      });
      if (expected && matchingTransaction?.id !== expected.transactionId)
        throw new ConflictError('The statement reference does not identify the selected settled transaction.');
      const bankStatement = await this.persistence.statementImport.findOne({
        where: { companyId, id: entry.importId }, transaction,
      });
      const order = matchingTransaction ? await this.persistence.order.findOne({
        where: { companyId, id: matchingTransaction.orderId, status: 'SETTLED' }, transaction,
      }) : null;
      const batch = order?.batchId ? await this.persistence.batch.findOne({
        where: { companyId, id: order.batchId }, transaction,
      }) : null;
      const exact =
        !!matchingTransaction &&
        !!bankStatement && !!batch && batch.sourceAccountId === bankStatement.sourceAccountId &&
        this.normalizeAmount(String(matchingTransaction.amount)) ===
          this.normalizeAmount(String(entry.amount)) &&
        String(matchingTransaction.currency) === String(entry.currency) &&
        entry.direction === 'DEBIT';
      if (matchingTransaction && exact) {
        await this.persistence.transaction.updateWhere(
          { status: 'RECONCILED', updatedAt: new Date() },
          { where: { companyId, id: matchingTransaction.id }, transaction },
        );
        await this.persistence.order.updateWhere(
          { status: 'RECONCILED', updatedAt: new Date() },
          { where: { companyId, id: matchingTransaction.orderId }, transaction },
        );
        if (order)
          await this.persistence.instruction.updateWhere(
            { status: 'RECONCILED', updatedAt: new Date() },
            { where: { companyId, id: order.instructionId }, transaction },
          );
      }
      const result: PaymentReconciliation = {
        id: randomUUID(),
        companyId,
        transactionId: matchingTransaction ? String(matchingTransaction.id) : null,
        reference,
        externalAmount: this.normalizeAmount(String(entry.amount)),
        externalCurrency: String(entry.currency),
        reconciledBy: actorUserId.toString(),
        status: exact ? 'MATCHED' : 'RECONCILIATION_EXCEPTION',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.persistence.reconciliation.create({
        id: result.id,
        companyId,
        statementEntryId: entry.id,
        transactionId: matchingTransaction?.id ?? null,
        reference,
        externalAmount: result.externalAmount,
        externalCurrency: result.externalCurrency,
        reconciledBy: actorUserId,
        status: result.status,
        notes: expected?.notes ?? null,
        evidence: null,
      }, { transaction });
      if (matchingTransaction && exact)
        await this.persistence.statementEntry.updateWhere(
          { matchedTransactionId: matchingTransaction.id },
          { where: { companyId, id: entry.id }, transaction },
        );
      return result;
    });
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

  async resolveReconciliationException(
    companyId: number,
    actorUserId: number,
    id: string,
    input: { notes: string; evidence: string[] },
  ) {
    if (!input.notes.trim() || input.evidence.length === 0)
      throw new ConflictError('Resolution requires a reason and supporting evidence reference.');
    const reconciliation = this.reconciliations.find(
      (item) => item.companyId === companyId && item.id === id,
    );
    const persisted = await this.persistence.reconciliation.findOne({ where: { companyId, id } });
    if (!reconciliation && !persisted) throw new NotFoundError('Payment reconciliation');
    if (persisted && persisted.status !== 'RECONCILIATION_EXCEPTION')
      throw new ConflictError('Only reconciliation exceptions can be resolved.');

    if (reconciliation) {
      reconciliation.status = 'RESOLVED';
      reconciliation.notes = input.notes;
      reconciliation.updatedAt = new Date().toISOString();
    }
    const resolved = await this.persistence.reconciliation.updateWhere(
      {
        status: 'RESOLVED',
        notes: input.notes,
        evidence: input.evidence,
        resolvedBy: actorUserId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      },
      { where: { companyId, id, status: 'RECONCILIATION_EXCEPTION' } },
    );
    if (!resolved) throw new ConflictError('The reconciliation exception has changed status.');

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'payments.reconciliation.resolved',
      entityType: 'payment_reconciliation',
      entityId: id,
      after: { status: 'RESOLVED', notes: input.notes, evidenceCount: input.evidence.length },
    });

    return { ...persisted!, status: 'RESOLVED', notes: input.notes, evidence: input.evidence };
  }

  async getSummary(companyId: number): Promise<PaymentSummaryReport> {
    const instructions = await this.persistence.instruction.findAll({
      where: { companyId, status: { [Op.notIn]: ['CANCELLED', 'REJECTED'] } },
    });
    const transactions = await this.persistence.transaction.findAll({ where: { companyId } });
    const authorized = instructions.filter(item => ['APPROVED', 'SUBMITTED', 'PROCESSING',
      'SETTLED', 'RECONCILED', 'SUBMISSION_UNKNOWN', 'PARTIALLY_SETTLED'].includes(item.status));
    const confirmed = transactions.filter(item => ['SETTLED', 'RECONCILED'].includes(item.status));
    const currencies = [...new Set([...authorized, ...confirmed].map(row => row.currency))].sort();
    const byCurrency = currencies.map(currency => ({
      currency,
      authorized: this.sumAmounts(authorized.filter(row => row.currency === currency).map(row => row.amount)),
      confirmed: this.sumAmounts(confirmed.filter(row => row.currency === currency).map(row => row.amount)),
    }));
    return {
      byCurrency,
      totalAuthorized: byCurrency.length > 1 ? null : byCurrency[0]?.authorized ?? '0.00',
      totalConfirmed: byCurrency.length > 1 ? null : byCurrency[0]?.confirmed ?? '0.00',
      pendingPayments: instructions.filter((item) =>
        ['PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'SUBMITTED', 'SUBMISSION_UNKNOWN'].includes(String(item.status)),
      ).length,
      failedPayments: instructions.filter((item) =>
        ['FAILED', 'RETURNED', 'PARTIALLY_SETTLED'].includes(String(item.status)),
      ).length,
    };
  }

  async settlementReport(companyId: number) {
    return (
      await this.persistence.transaction.findAll({
        where: { companyId, status: ['SETTLED', 'RECONCILED'] },
        order: [['settledAt', 'DESC']],
      })
    ).map((row) => row);
  }

  async failedReport(companyId: number) {
    return (
      await this.persistence.transaction.findAll({
        where: { companyId, status: ['FAILED', 'RETURNED', 'PARTIALLY_SETTLED'] },
        order: [['updatedAt', 'DESC']],
      })
    ).map((row) => row);
  }

  async reconciliationReport(companyId: number) {
    return this.listReconciliations(companyId);
  }

  async exportReport(
    companyId: number,
    actorUserId: number,
    input: {
      format: 'PDF' | 'CSV' | 'XLSX';
      reportType: 'summary' | 'settlements' | 'failed' | 'returns' | 'reconciliation';
    },
  ) {
    if (input.format !== 'CSV')
      throw new ConflictError(
        'Only CSV report export is currently available; PDF and XLSX renderers are not configured.',
      );
    const report =
      input.reportType === 'summary'
        ? await this.getSummary(companyId).then(summary => (summary.byCurrency.length ? summary.byCurrency : [
            { currency: '', authorized: '0.00', confirmed: '0.00' },
          ]).map(row => ({ ...row, pendingPayments: summary.pendingPayments, failedPayments: summary.failedPayments })))
        : input.reportType === 'settlements'
          ? await this.settlementReport(companyId)
          : input.reportType === 'failed'
            ? await this.failedReport(companyId)
            : input.reportType === 'returns'
              ? await this.listReturns(companyId)
              : await this.reconciliationReport(companyId);
    const content = this.toCsv(report as unknown as Array<Record<string, unknown>>);
    const file = {
      id: randomUUID(),
      companyId,
      format: 'CSV' as const,
      reportType: input.reportType,
      fileName: `payments-${input.reportType}-${new Date().toISOString().slice(0, 10)}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content,
      createdAt: new Date().toISOString(),
    };

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
      throw new ConflictError(
        'PAYMENTS_PII_ENCRYPTION_KEY must be configured as a 32-byte hexadecimal secret before registering bank accounts.',
      );
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(configured, 'hex'), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
  }

  private decryptAccount(value: string): string {
    const configured = process.env.PAYMENTS_PII_ENCRYPTION_KEY;
    if (!configured || !/^[a-fA-F0-9]{64}$/.test(configured))
      throw new ConflictError('PAYMENTS_PII_ENCRYPTION_KEY is not configured.');
    const [ivHex, tagHex, ciphertextHex] = value.split(':');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(configured, 'hex'),
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }

  private maskAccount(fingerprint: string): string {
    return `••••${fingerprint}`;
  }

  private async providerSource(companyId: number, accountId: string, currency: string) {
    const source = await this.persistence.bankAccount.findOne({
      where: { companyId, id: accountId, status: 'VERIFIED', currency },
    });
    if (!source?.accountCiphertext)
      throw new ConflictError('A verified debit account matching the transfer currency is required.');
    return { id: source.id, bankCode: source.bankCode, accountNumber: this.decryptAccount(source.accountCiphertext) };
  }

  private presentInstruction(row: any): PaymentInstruction {
    const snapshot = row.beneficiarySnapshot;
    const { beneficiarySnapshot: _snapshot, ...safe } = row;
    return {
      ...safe,
      beneficiary: snapshot
        ? {
            name: snapshot.name,
            bankCode: snapshot.bankCode,
            accountNumber: this.maskAccount(snapshot.accountFingerprint),
          }
        : undefined,
    } as PaymentInstruction;
  }

  private async applyProviderSubmission(
    companyId: number,
    order: PaymentOrder,
    submission: PaymentProviderSubmission,
    updateBatch = true,
  ) {
    if (
      !submission.providerReference?.trim() ||
      (submission.status === 'SETTLED' && !submission.settledAt)
    ) {
      throw new PaymentSubmissionUnknownError(
        'Provider status response is incomplete; query the provider before retrying.',
      );
    }
    const existing = await this.persistence.transaction.findOne({
      where: { companyId, providerReference: submission.providerReference },
    });
    if (existing && existing.orderId !== order.id)
      throw new ConflictError('Provider reference is already linked to another payment order.');
    const updatedAt = new Date();
    if (existing) {
      await this.persistence.update(existing, {
        status: submission.status,
        settledAt: submission.settledAt ?? null,
        updatedAt,
      });
    } else {
      await this.persistence.transaction.create({
        id: randomUUID(),
        companyId,
        orderId: order.id,
        providerReference: submission.providerReference,
        amount: order.amount,
        currency: order.currency,
        status: submission.status,
        settledAt: submission.settledAt ?? null,
        providerPayloadHash: null,
      });
    }
    order.status = submission.status;
    order.updatedAt = updatedAt.toISOString();
    await this.persistence.order.updateWhere(
      { status: submission.status, updatedAt },
      { where: { companyId, id: order.id } },
    );
    await this.persistence.instruction.updateWhere(
      { status: submission.status, updatedAt },
      { where: { companyId, id: order.instructionId } },
    );
    const attempt = await this.persistence.attempt.findOne({
      where: { companyId, orderId: order.id },
      order: [['attemptNumber', 'DESC']],
    });
    if (attempt)
      await this.persistence.update(attempt, {
        status: submission.status,
        providerReference: submission.providerReference,
        completedAt: updatedAt,
      });
    if (order.batchId && updateBatch) {
      const items = await this.persistence.batchItem.findAll({
        where: { companyId, batchId: order.batchId },
      });
      const orders = await this.persistence.order.findAll({
        where: { companyId, batchId: order.batchId },
      });
      const states = orders.map((item) => String(item.status));
      const batchStatus: PaymentBatch['status'] =
        states.length && states.every((status) => status === 'SETTLED')
          ? 'SETTLED'
          : states.length && states.every((status) => status === 'FAILED')
            ? 'FAILED'
            : states.some((status) => status === 'SUBMISSION_UNKNOWN')
              ? 'SUBMISSION_UNKNOWN'
              : states.some((status) => status === 'FAILED')
                ? 'PARTIALLY_SETTLED'
                : 'PROCESSING';
      await this.persistence.batch.updateWhere(
        { status: batchStatus, updatedAt },
        { where: { companyId, id: order.batchId } },
      );
      for (const item of items) {
        const associatedOrder = orders.find(
          (candidate) => candidate.instructionId === item.instructionId,
        );
        if (associatedOrder)
          await this.persistence.update(item, { status: associatedOrder.status, updatedAt });
      }
    }
    return this.persistence.transaction
      .findOne({
        where: { companyId, providerReference: submission.providerReference },
      })
      .then((row) => row);
  }

  private async loadBeneficiary(
    companyId: number,
    instructionId: string,
  ): Promise<{ name: string; accountNumber: string; bankCode: string } | undefined> {
    const row = await this.persistence.instruction.findOne({
      where: { companyId, id: instructionId },
    });
    const snapshot = row?.beneficiarySnapshot as any;
    if (!snapshot?.accountNumberCiphertext) return undefined;
    return {
      name: snapshot.name,
      bankCode: snapshot.bankCode,
      accountNumber: this.decryptAccount(snapshot.accountNumberCiphertext),
    };
  }

  private toCsv(rows: Array<Record<string, unknown>>): string {
    if (rows.length === 0) return '';
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const cell = (value: unknown) => {
      const text = String(value ?? '');
      const escaped = /^(?:\s*[=+@-]|[\t\r\n])/.test(text) ? "'" + text : text;
      return `"${escaped.replace(/"/g, '""')}"`;
    };
    return [
      headers.map(cell).join(','),
      ...rows.map((row) => headers.map((key) => cell(row[key])).join(',')),
    ].join('\r\n');
  }

  private sumAmounts(values: Array<number | string>): string {
    const cents = values.reduce(
      (sum, value) => sum + BigInt(this.normalizeAmount(value).replace('.', '')),
      0n,
    );
    return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
  }
}
