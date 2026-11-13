import { randomUUID } from 'crypto';
import { Op, QueryTypes, Transaction, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../../../shared/errors/app.error';
import { EmployeeModel } from '../../../../employees/infrastructure/persistence/model/employee.model';
import { EmploymentContractModel } from '../../../../contracts/infrastructure/persistence/model/employment-contract.model';
import { CompanyModel } from '../../../../tenancy/infrastructure/persistence/model/company.model';
import { RepaymentPlanGenerator } from '../../../domain/services/repayment-plan-generator.service';
import { Money } from '../../../domain/value-objects/money.vo';
import { EmployeeLoanModel } from '../model/employee-loan.model';
import { LoanApplicationModel, LoanType } from '../model/loan-application.model';
import { LoanApprovalModel } from '../model/loan-approval.model';
import { LoanDeductionModel } from '../model/loan-deduction.model';
import { LoanDisbursementModel } from '../model/loan-disbursement.model';
import { LoanInstallmentModel } from '../model/loan-installment.model';
import { LoanLedgerEntryModel } from '../model/loan-ledger-entry.model';
import { LoanOutboxModel } from '../model/loan-outbox.model';
import { LoanPolicyModel } from '../model/loan-policy.model';
import { LoanRenegotiationModel } from '../model/loan-renegotiation.model';
import { LoanRepaymentModel } from '../model/loan-repayment.model';
import { RepaymentPlanModel } from '../model/repayment-plan.model';

type Frequency = 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY';
type ApplicationInput = {
  employeeId: string;
  loanType: LoanType;
  requestedAmount: string;
  currency: string;
  installmentCount: number;
  frequency: Frequency;
  firstDueDate: string;
  annualInterestBps?: number;
  reason: string;
};
type PolicyInput = {
  code: string;
  effectiveFrom: string;
  maxAmount: string;
  maxInstallments: number;
  maxActiveLoans: number;
  allowedTypes: LoanType[];
  interestAllowed: boolean;
  maxAnnualInterestBps: number;
  deductionAuthorizationRequired: boolean;
};

const now = (): Date => new Date();
const today = (): string => now().toISOString().slice(0, 10);
const MAX_CENTS = 999_999_999_999_999n;
const toCents = (value: string | number): bigint => {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : value;
  if (typeof normalized !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(normalized)) {
    throw new ValidationError('A valid non-negative monetary amount is required.');
  }
  const [whole, fraction = ''] = normalized.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > MAX_CENTS) throw new ValidationError('Money exceeds the supported database amount.');
  return cents;
};
const centsToString = (value: bigint): string => {
  if (value < 0n) throw new ConflictError('Loan balance cannot become negative.');
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
};
const dateIsValid = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const withTenant = async <T>(
  companyId: number,
  operation: (transaction: Transaction) => Promise<T>,
): Promise<T> =>
  sequelize.transaction(async (transaction) => {
    if (sequelize.getDialect() === 'postgres') {
      await sequelize.query("SELECT set_config('app.current_tenant', :companyId, true)", {
        replacements: { companyId: String(companyId) },
        type: QueryTypes.SELECT,
        transaction,
      });
    }
    return operation(transaction);
  });

export class SequelizeLoansRepository {
  private readonly planGenerator = new RepaymentPlanGenerator();

  async createApplication(companyId: number, actorUserId: number, input: ApplicationInput) {
    this.validateApplication(input);
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      await this.requireEmployee(companyId, input.employeeId, transaction);
      const policy = await this.findPolicy(companyId, today(), transaction, input.loanType);
      if (policy) this.validateAgainstPolicy(input, policy);
      const row = await LoanApplicationModel.create(
        {
          id: randomUUID(),
          companyId,
          ...input,
          annualInterestBps: input.annualInterestBps ?? 0,
          status: 'DRAFT',
          version: 1,
          createdBy: actorUserId,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      await this.event(transaction, companyId, row.id, 'loans.application.created', {
        employeeId: row.employeeId,
        amount: row.requestedAmount,
        loanType: row.loanType,
      });
      return row;
    });
  }

  async updateApplication(companyId: number, id: string, input: Partial<ApplicationInput>) {
    return withTenant(companyId, async (transaction) => {
      const application = await this.requireApplication(companyId, id, transaction, true);
      if (application.status !== 'DRAFT') throw new ConflictError('Only draft loan applications can be changed.');
      const merged = { ...application.toJSON(), ...input };
      this.validateApplication(merged);
      const policy = await this.findPolicy(companyId, today(), transaction, merged.loanType);
      if (policy) this.validateAgainstPolicy(merged, policy);
      await application.update({ ...input, version: application.version + 1, updatedAt: now() }, { transaction });
      return application;
    });
  }

  async submitApplication(companyId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const application = await this.requireApplication(companyId, id, transaction, true);
      if (application.status !== 'DRAFT') throw new ConflictError('Only draft loan applications can be submitted.');
      const policy = await this.findPolicy(companyId, today(), transaction, application.loanType);
      if (!policy) throw new ConflictError('An active loan policy is required before submitting applications.');
      this.validateAgainstPolicy(application, policy);
      await this.requireEligibleEmployee(companyId, application.employeeId, transaction);
      const activeLoans = await EmployeeLoanModel.count({
        where: { companyId, employeeId: application.employeeId, status: { [Op.in]: ['ACTIVE', 'SUSPENDED', 'PENDING_DISBURSEMENT'] } },
        transaction,
      });
      if (activeLoans >= policy.maxActiveLoans) throw new ConflictError('Employee has reached the active loan limit.');
      const outstanding = await this.getEmployeeOutstanding(companyId, application.employeeId, transaction);
      const requestedCents = toCents(application.requestedAmount);
      if (requestedCents + outstanding > toCents(policy.maxAmount)) {
        throw new ConflictError('Application exceeds the employee borrowing limit after existing obligations.');
      }
      await application.update({ status: 'PENDING_APPROVAL', version: application.version + 1, updatedAt: now() }, { transaction });
      await this.event(transaction, companyId, application.id, 'loans.application.submitted', {
        employeeId: application.employeeId,
        policyVersion: policy.version,
      });
      return application;
    });
  }

  async decideApplication(
    companyId: number,
    actorUserId: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    comments?: string,
  ) {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const application = await this.requireApplication(companyId, id, transaction, true);
      if (application.status !== 'PENDING_APPROVAL') throw new ConflictError('Only pending applications can be decided.');
      if (application.createdBy === actorUserId) throw new ForbiddenError('Applicants cannot approve or reject their own application.');
      if (decision === 'APPROVED') {
        const policy = await this.findPolicy(companyId, today(), transaction, application.loanType);
        if (!policy) throw new ConflictError('An active loan policy is required.');
        this.validateAgainstPolicy(application, policy);
        await this.requireEligibleEmployee(companyId, application.employeeId, transaction);
        const activeLoans = await EmployeeLoanModel.count({
          where: {
            companyId,
            employeeId: application.employeeId,
            status: { [Op.in]: ['ACTIVE', 'SUSPENDED', 'PENDING_DISBURSEMENT'] },
          },
          transaction,
        });
        if (activeLoans >= policy.maxActiveLoans) throw new ConflictError('Employee has reached the active loan limit.');
        const outstanding = await this.getEmployeeOutstanding(companyId, application.employeeId, transaction);
        if (toCents(application.requestedAmount) + outstanding > toCents(policy.maxAmount)) {
          throw new ConflictError('Application exceeds the employee borrowing limit after existing obligations.');
        }
        await this.createApprovedLoan(companyId, actorUserId, application, policy, transaction);
      } else {
        await application.update({ status: 'REJECTED', version: application.version + 1, updatedAt: now() }, { transaction });
      }
      await LoanApprovalModel.create(
        {
          id: randomUUID(),
          companyId,
          applicationId: application.id,
          approverId: actorUserId,
          decision,
          comments: comments ?? null,
          decidedAt: now(),
        },
        { transaction },
      );
      await this.event(transaction, companyId, application.id, `loans.application.${decision.toLowerCase()}`, {
        approverId: actorUserId,
      });
      return application;
    });
  }

  async cancelApplication(companyId: number, id: string, actorUserId: number) {
    return withTenant(companyId, async (transaction) => {
      const application = await this.requireApplication(companyId, id, transaction, true);
      if (application.createdBy !== actorUserId) throw new ForbiddenError('Only the applicant can cancel this application.');
      if (!['DRAFT', 'PENDING_APPROVAL'].includes(application.status)) {
        throw new ConflictError('This loan application can no longer be cancelled.');
      }
      await application.update({ status: 'CANCELLED', version: application.version + 1, updatedAt: now() }, { transaction });
      await this.event(transaction, companyId, application.id, 'loans.application.cancelled', {});
      return application;
    });
  }

  async getApplication(companyId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      const application = await this.requireApplication(companyId, id, transaction);
      const approvals = await LoanApprovalModel.findAll({
        where: { companyId, applicationId: id },
        order: [['decidedAt', 'ASC']],
        transaction,
      });
      return { ...application.toJSON(), approvals };
    });
  }

  async listApplications(
    companyId: number,
    query: { employeeId?: string; status?: string; page: number; limit: number },
  ) {
    return withTenant(companyId, async (transaction) => {
      const result = await LoanApplicationModel.findAndCountAll({
        where: {
          companyId,
          ...(query.employeeId ? { employeeId: query.employeeId } : {}),
          ...(query.status ? { status: query.status } : {}),
        },
        order: [['createdAt', 'DESC']],
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        transaction,
      });
      return { data: result.rows, total: result.count, page: query.page, limit: query.limit };
    });
  }

  async listLoans(companyId: number, query: { employeeId?: string; status?: string; page: number; limit: number }) {
    return withTenant(companyId, async (transaction) => {
      const result = await EmployeeLoanModel.findAndCountAll({
        where: {
          companyId,
          ...(query.employeeId ? { employeeId: query.employeeId } : {}),
          ...(query.status ? { status: query.status } : {}),
        },
        order: [['createdAt', 'DESC']],
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        transaction,
      });
      const data = await Promise.all(result.rows.map(async (loan) => ({
        ...loan.toJSON(),
        balance: await this.balance(companyId, loan.id, loan.currency, transaction),
      })));
      return { data, total: result.count, page: query.page, limit: query.limit };
    });
  }

  async getLoan(companyId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      const loan = await this.requireLoan(companyId, id, transaction);
      return {
        ...loan.toJSON(),
        balance: await this.balance(companyId, loan.id, loan.currency, transaction),
      };
    });
  }

  async getBalance(companyId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      const loan = await this.requireLoan(companyId, id, transaction);
      return { loanId: id, ...(await this.balance(companyId, id, loan.currency, transaction)) };
    });
  }

  async listPlans(companyId: number, loanId: string) {
    return withTenant(companyId, async (transaction) => {
      await this.requireLoan(companyId, loanId, transaction);
      const plans = await RepaymentPlanModel.findAll({
        where: { companyId, loanId },
        order: [['version', 'DESC']],
        transaction,
      });
      const result = [];
      for (const plan of plans) {
        const installments = await LoanInstallmentModel.findAll({
          where: { companyId, planId: plan.id },
          order: [['installmentNumber', 'ASC']],
          transaction,
        });
        result.push({ ...plan.toJSON(), installments });
      }
      return result;
    });
  }

  async listInstallments(companyId: number, loanId: string) {
    return withTenant(companyId, async (transaction) => {
      await this.requireLoan(companyId, loanId, transaction);
      const plan = await RepaymentPlanModel.findOne({
        where: { companyId, loanId, status: 'ACTIVE' },
        order: [['version', 'DESC']],
        transaction,
      });
      if (!plan) return [];
      const installments = await LoanInstallmentModel.findAll({
        where: { companyId, loanId, planId: plan.id },
        order: [['installmentNumber', 'ASC']],
        transaction,
      });
      return Promise.all(installments.map(async (installment) => ({
        ...installment.toJSON(),
        paid: await this.installmentPaid(companyId, installment.id, transaction),
      })));
    });
  }

  async requestDisbursement(
    companyId: number,
    actorUserId: number,
    loanId: string,
    input: { paymentReference?: string; idempotencyKey: string },
  ) {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const loan = await this.requireLoan(companyId, loanId, transaction, true);
      const existing = await LoanDisbursementModel.findOne({
        where: { companyId, idempotencyKey: input.idempotencyKey },
        transaction,
      });
      if (existing) {
        if (
          existing.loanId !== loanId ||
          existing.paymentReference !== (input.paymentReference ?? null)
        ) {
          throw new ConflictError('Disbursement key is already associated with a different request.');
        }
        return existing;
      }
      if (loan.status !== 'PENDING_DISBURSEMENT') throw new ConflictError('Only approved loans awaiting disbursement can be disbursed.');
      const disbursement = await LoanDisbursementModel.create(
        {
          id: randomUUID(),
          companyId,
          loanId,
          amount: loan.principalAmount,
          paymentReference: input.paymentReference ?? null,
          idempotencyKey: input.idempotencyKey,
          status: 'REQUESTED',
          confirmedAt: null,
          createdBy: actorUserId,
          createdAt: now(),
        },
        { transaction },
      );
      await this.event(transaction, companyId, loan.id, 'loans.disbursement.requested', {
        disbursementId: disbursement.id,
        amount: loan.principalAmount,
      });
      return disbursement;
    });
  }

  async confirmDisbursement(
    companyId: number,
    actorUserId: number,
    loanId: string,
    disbursementId: string,
    paymentReference: string,
  ) {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const loan = await this.requireLoan(companyId, loanId, transaction, true);
      const disbursement = await LoanDisbursementModel.findOne({
        where: { id: disbursementId, companyId, loanId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!disbursement) throw new NotFoundError('Loan disbursement');
      if (disbursement.status === 'CONFIRMED') return loan;
      if (disbursement.status !== 'REQUESTED' || loan.status !== 'PENDING_DISBURSEMENT') {
        throw new ConflictError('This disbursement cannot be confirmed.');
      }
      if (!paymentReference.trim()) throw new ValidationError('A confirmed payment reference is required.');
      await LoanLedgerEntryModel.create(
        {
          id: randomUUID(),
          companyId,
          loanId,
          installmentId: null,
          entryType: 'DISBURSEMENT',
          principalAmount: loan.principalAmount,
          interestAmount: '0.00',
          currency: loan.currency,
          source: 'PAYMENT',
          externalReference: paymentReference,
          idempotencyKey: `DISBURSEMENT:${disbursement.id}`,
          occurredAt: now(),
          createdBy: actorUserId,
        },
        { transaction },
      );
      await disbursement.update({ status: 'CONFIRMED', paymentReference, confirmedAt: now() }, { transaction });
      await loan.update({ status: 'ACTIVE', disbursedAt: now(), version: loan.version + 1, updatedAt: now() }, { transaction });
      const application = await this.requireApplication(companyId, loan.applicationId, transaction, true);
      await application.update({ status: 'ACTIVE', version: application.version + 1, updatedAt: now() }, { transaction });
      await this.event(transaction, companyId, loan.id, 'loans.disbursement.confirmed', {
        disbursementId,
        paymentReference,
      });
      return loan;
    }).catch((error: unknown) => {
      if (error instanceof UniqueConstraintError) throw new ConflictError('Disbursement has already been confirmed.');
      throw error;
    });
  }

  async listDisbursements(companyId: number, loanId: string) {
    return withTenant(companyId, async (transaction) => {
      await this.requireLoan(companyId, loanId, transaction);
      return LoanDisbursementModel.findAll({
        where: { companyId, loanId },
        order: [['createdAt', 'DESC']],
        transaction,
      });
    });
  }

  async registerRepayment(
    companyId: number,
    actorUserId: number,
    loanId: string,
    input: { amount: string; source: string; externalReference: string; idempotencyKey: string },
  ) {
    const amount = toCents(input.amount);
    if (amount <= 0n || !input.externalReference.trim()) throw new ValidationError('A positive repayment and external confirmation reference are required.');
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const loan = await this.requireLoan(companyId, loanId, transaction, true);
      const existing = await LoanRepaymentModel.findOne({
        where: { companyId, source: input.source, idempotencyKey: input.idempotencyKey },
        transaction,
      });
      if (existing) {
        if (
          existing.loanId !== loanId ||
          existing.externalReference !== input.externalReference ||
          toCents(existing.amount) !== amount
        ) {
          throw new ConflictError('Repayment idempotency key was already used for a different payment.');
        }
        return existing;
      }
      if (!['ACTIVE', 'SUSPENDED'].includes(loan.status)) throw new ConflictError('Repayments require a disbursed loan.');
      const currentBalance = await this.balance(companyId, loan.id, loan.currency, transaction);
      if (amount > toCents(currentBalance.total)) throw new ConflictError('Repayment exceeds the outstanding loan balance.');
      const repayment = await LoanRepaymentModel.create(
        {
          id: randomUUID(),
          companyId,
          loanId,
          amount: input.amount,
          currency: loan.currency,
          source: input.source,
          externalReference: input.externalReference,
          idempotencyKey: input.idempotencyKey,
          status: 'CONFIRMED',
          createdBy: actorUserId,
          createdAt: now(),
        },
        { transaction },
      );
      await this.allocateRepayment(companyId, actorUserId, loan, repayment, amount, transaction);
      const balance = await this.balance(companyId, loan.id, loan.currency, transaction);
      if (balance.total === '0.00') {
        await loan.update({ status: 'SETTLED', version: loan.version + 1, updatedAt: now() }, { transaction });
        await this.requireApplication(companyId, loan.applicationId, transaction).then((app) =>
          app.update({ status: 'SETTLED', version: app.version + 1, updatedAt: now() }, { transaction }),
        );
        await this.event(transaction, companyId, loan.id, 'loans.loan.settled', { repaymentId: repayment.id });
      }
      await this.event(transaction, companyId, loan.id, 'loans.repayment.confirmed', {
        repaymentId: repayment.id,
        amount: input.amount,
        source: input.source,
      });
      return repayment;
    }).catch((error: unknown) => {
      if (error instanceof UniqueConstraintError) throw new ConflictError('Repayment reference was already processed.');
      throw error;
    });
  }

  async listRepayments(companyId: number, loanId: string) {
    return withTenant(companyId, async (transaction) => {
      await this.requireLoan(companyId, loanId, transaction);
      return LoanRepaymentModel.findAll({
        where: { companyId, loanId },
        order: [['createdAt', 'DESC']],
        transaction,
      });
    });
  }

  async reverseRepayment(companyId: number, actorUserId: number, loanId: string, repaymentId: string, reversalReference: string) {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const loan = await this.requireLoan(companyId, loanId, transaction, true);
      const repayment = await LoanRepaymentModel.findOne({
        where: { id: repaymentId, companyId, loanId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!repayment) throw new NotFoundError('Loan repayment');
      if (repayment.status === 'REVERSED') return repayment;
      if (!reversalReference.trim()) throw new ValidationError('A reversal reference is required.');
      const originals = await LoanLedgerEntryModel.findAll({
        where: { companyId, loanId, source: 'REPAYMENT', externalReference: repayment.id },
        transaction,
      });
      if (!originals.length) throw new ConflictError('No ledger allocation exists for this repayment.');
      if (originals[0].currency !== loan.currency) throw new ConflictError('Repayment currency does not match the loan.');
      for (const original of originals) {
        await LoanLedgerEntryModel.create(
          {
            id: randomUUID(),
            companyId,
            loanId,
            installmentId: original.installmentId,
            entryType: 'REVERSAL',
            principalAmount: original.principalAmount,
            interestAmount: original.interestAmount,
            currency: original.currency,
            source: `REVERSAL:${repayment.source}`,
            externalReference: reversalReference,
            idempotencyKey: `REVERSAL:${repayment.id}:${original.id}`,
            occurredAt: now(),
            createdBy: actorUserId,
          },
          { transaction },
        );
      }
      await repayment.update({ status: 'REVERSED' }, { transaction });
      if (loan.status === 'SETTLED') {
        await loan.update({ status: 'ACTIVE', version: loan.version + 1, updatedAt: now() }, { transaction });
        const app = await this.requireApplication(companyId, loan.applicationId, transaction);
        await app.update({ status: 'ACTIVE', version: app.version + 1, updatedAt: now() }, { transaction });
      }
      const affectedInstallments = [
        ...new Set(originals.map((entry) => entry.installmentId).filter((value): value is string => value !== null)),
      ];
      for (const installmentId of affectedInstallments) {
        const installment = await LoanInstallmentModel.findOne({
          where: { id: installmentId, companyId, loanId },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!installment) continue;
        const paid = await this.installmentPaid(companyId, installmentId, transaction);
        const due = toCents(installment.principalDue) + toCents(installment.interestDue);
        const paidAmount = toCents(paid.principal) + toCents(paid.interest);
        await installment.update({
          status: paidAmount === 0n ? 'PENDING' : paidAmount >= due ? 'PAID' : 'PARTIALLY_PAID',
        }, { transaction });
      }
      await this.event(transaction, companyId, loan.id, 'loans.repayment.reversed', {
        repaymentId,
        reversalReference,
      });
      return repayment;
    });
  }

  async requestDeductions(companyId: number, loanId: string, actorUserId: number, idempotencyKey: string) {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const loan = await this.requireLoan(companyId, loanId, transaction, true);
      const existing = await LoanDeductionModel.findOne({ where: { companyId, idempotencyKey }, transaction });
      if (existing) {
        if (existing.loanId !== loanId) throw new ConflictError('Deduction key is already associated with another loan.');
        return existing;
      }
      if (loan.status !== 'ACTIVE') throw new ConflictError('Payroll deductions require an active loan.');
      const plan = await RepaymentPlanModel.findOne({
        where: { companyId, loanId, status: 'ACTIVE' },
        order: [['version', 'DESC']],
        transaction,
      });
      if (!plan) throw new ConflictError('Active repayment plan is unavailable.');
      const installment = await LoanInstallmentModel.findOne({
        where: { companyId, loanId, planId: plan.id, status: { [Op.in]: ['PENDING', 'PARTIALLY_PAID'] } },
        order: [['dueDate', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!installment) throw new ConflictError('No pending installment is available for payroll deduction.');
      const pendingDeduction = await LoanDeductionModel.findOne({
        where: { companyId, installmentId: installment.id, status: 'REQUESTED' },
        transaction,
      });
      if (pendingDeduction) throw new ConflictError('A deduction is already pending for this installment.');
      const paid = await this.installmentPaid(companyId, installment.id, transaction);
      const due = toCents(installment.principalDue) + toCents(installment.interestDue);
      const remaining = due - toCents(paid.total);
      if (remaining <= 0n) throw new ConflictError('Installment has already been paid.');
      const deduction = await LoanDeductionModel.create(
        {
          id: randomUUID(),
          companyId,
          loanId,
          installmentId: installment.id,
          payrollRunId: null,
          requestedAmount: centsToString(remaining),
          confirmedAmount: null,
          createdBy: actorUserId,
          status: 'REQUESTED',
          idempotencyKey,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      await this.event(transaction, companyId, deduction.id, 'loans.payroll-deduction.requested', {
        loanId,
        installmentId: installment.id,
        requestedAmount: deduction.requestedAmount,
      });
      return deduction;
    });
  }

  async confirmDeduction(
    companyId: number,
    actorUserId: number,
    id: string,
    input: { payrollRunId: string; confirmedAmount: string; idempotencyKey: string },
  ) {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const deduction = await LoanDeductionModel.findOne({
        where: { id, companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!deduction) throw new NotFoundError('Payroll deduction');
        if (deduction.payrollRunId && deduction.payrollRunId !== input.payrollRunId) throw new ConflictError('Deduction is reserved by another payroll execution.');
        if ((deduction.status === 'CONFIRMED' || deduction.status === 'PARTIAL') && toCents(String(deduction.confirmedAmount)) !== toCents(input.confirmedAmount)) throw new ConflictError('Confirmed deduction amount differs from this request.');
      if (deduction.status === 'CONFIRMED' || deduction.status === 'PARTIAL') return deduction;
      if (deduction.status !== 'REQUESTED') throw new ConflictError('This payroll deduction cannot be confirmed.');
      const confirmed = toCents(input.confirmedAmount);
      const requested = toCents(deduction.requestedAmount);
      if (confirmed <= 0n || confirmed > requested) throw new ValidationError('Confirmed deduction must be positive and no greater than requested.');
      const repayment = await this.registerRepaymentInTransaction(
        companyId,
        actorUserId,
        deduction.loanId,
        input.confirmedAmount,
        'PAYROLL',
        `${input.payrollRunId}:${deduction.id}`,
        input.idempotencyKey,
        deduction.installmentId,
        transaction,
      );
      await deduction.update(
        {
          payrollRunId: input.payrollRunId,
          confirmedAmount: input.confirmedAmount,
          status: confirmed === requested ? 'CONFIRMED' : 'PARTIAL',
          updatedAt: now(),
        },
        { transaction },
      );
      await this.event(transaction, companyId, deduction.id, 'loans.payroll-deduction.confirmed', {
        repaymentId: repayment.id,
        payrollRunId: input.payrollRunId,
        amount: input.confirmedAmount,
      });
      return deduction;
    });
  }

  async listDeductions(companyId: number, query: { loanId?: string; status?: string; page: number; limit: number }) {
    return withTenant(companyId, async (transaction) => {
      const result = await LoanDeductionModel.findAndCountAll({
        where: {
          companyId,
          ...(query.loanId ? { loanId: query.loanId } : {}),
          ...(query.status ? { status: query.status } : {}),
        },
        order: [['createdAt', 'DESC']],
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        transaction,
      });
      return { data: result.rows, total: result.count, page: query.page, limit: query.limit };
    });
  }

  async requestRenegotiation(
    companyId: number,
    actorUserId: number,
    loanId: string,
    input: { installmentCount: number; firstDueDate: string; frequency: Frequency; reason: string },
  ) {
    if (!dateIsValid(input.firstDueDate) || input.installmentCount < 1 || input.installmentCount > 120) {
      throw new ValidationError('Invalid renegotiated repayment schedule.');
    }
    return withTenant(companyId, async (transaction) => {
      const loan = await this.requireLoan(companyId, loanId, transaction, true);
      if (loan.status !== 'ACTIVE') throw new ConflictError('Only active loans can be renegotiated.');
      const plan = await RepaymentPlanModel.findOne({
        where: { companyId, loanId, status: 'ACTIVE' },
        order: [['version', 'DESC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!plan) throw new ConflictError('Active repayment plan is unavailable.');
      const pending = await LoanRenegotiationModel.findOne({
        where: { companyId, loanId, status: 'PENDING' },
        transaction,
      });
      if (pending) throw new ConflictError('A renegotiation is already awaiting approval.');
      const request = await LoanRenegotiationModel.create(
        {
          id: randomUUID(),
          companyId,
          loanId,
          previousPlanId: plan.id,
          newPlanId: null,
          ...input,
          status: 'PENDING',
          requestedBy: actorUserId,
          decidedBy: null,
          decidedAt: null,
          createdAt: now(),
        },
        { transaction },
      );
      await this.event(transaction, companyId, request.id, 'loans.renegotiation.requested', { loanId });
      return request;
    });
  }

  async decideRenegotiation(companyId: number, actorUserId: number, id: string, decision: 'APPROVED' | 'REJECTED') {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const request = await LoanRenegotiationModel.findOne({
        where: { id, companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!request) throw new NotFoundError('Loan renegotiation');
      if (request.status !== 'PENDING') throw new ConflictError('Renegotiation has already been decided.');
      if (request.requestedBy === actorUserId) throw new ForbiddenError('Requesters cannot approve their own renegotiation.');
      if (decision === 'REJECTED') {
        await request.update({ status: decision, decidedBy: actorUserId, decidedAt: now() }, { transaction });
        return request;
      }
      const loan = await this.requireLoan(companyId, request.loanId, transaction, true);
      const balance = await this.balance(companyId, loan.id, loan.currency, transaction);
      const principalCents = toCents(balance.principal);
      const interestCents = toCents(balance.interest);
      if (principalCents <= 0n) throw new ConflictError('A loan without outstanding principal cannot be renegotiated.');
      const oldPlans = await RepaymentPlanModel.findAll({
        where: { companyId, loanId: loan.id, status: 'ACTIVE' },
        transaction,
      });
      for (const oldPlan of oldPlans) {
        await oldPlan.update({ status: 'SUPERSEDED' }, { transaction });
      }
      if (interestCents > 0n) {
        throw new ConflictError('Renegotiating outstanding interest is not supported; reconcile interest before requesting a new plan.');
      }
      const newPlan = await this.createPlan(
        companyId,
        loan,
        centsToString(principalCents),
        request.installmentCount,
        request.firstDueDate,
        request.frequency,
        0,
        transaction,
      );
      await request.update({
        status: 'APPROVED',
        newPlanId: newPlan.id,
        decidedBy: actorUserId,
        decidedAt: now(),
      }, { transaction });
      await this.event(transaction, companyId, loan.id, 'loans.renegotiation.approved', { renegotiationId: id, planId: newPlan.id });
      return request;
    });
  }

  async setLoanStatus(companyId: number, actorUserId: number, id: string, action: 'SUSPEND' | 'RESUME') {
    return withTenant(companyId, async (transaction) => {
      const loan = await this.requireLoan(companyId, id, transaction, true);
      const expected = action === 'SUSPEND' ? 'ACTIVE' : 'SUSPENDED';
      const next = action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE';
      if (loan.status !== expected) throw new ConflictError(`Loan must be ${expected} before this operation.`);
      await loan.update({ status: next, version: loan.version + 1, updatedAt: now() }, { transaction });
      const event = action === 'SUSPEND' ? 'loans.loan.suspended' : 'loans.loan.resumed';
      await this.event(transaction, companyId, loan.id, event, { actorUserId });
      return loan;
    });
  }

  async settleLoan(companyId: number, actorUserId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const loan = await this.requireLoan(companyId, id, transaction, true);
      if (!['ACTIVE', 'SUSPENDED', 'SETTLED'].includes(loan.status)) {
        throw new ConflictError('Only disbursed loans can be settled.');
      }
      const balance = await this.balance(companyId, loan.id, loan.currency, transaction);
      if (balance.total !== '0.00') throw new ConflictError('Loan can only be settled after confirmed repayments reconcile its balance.');
      if (loan.status !== 'SETTLED') {
        await loan.update({ status: 'SETTLED', version: loan.version + 1, updatedAt: now() }, { transaction });
      }
      await this.event(transaction, companyId, loan.id, 'loans.loan.settled', { actorUserId, balance });
      return { loan, balance };
    });
  }

  async listPolicies(companyId: number) {
    return withTenant(companyId, (transaction) =>
      LoanPolicyModel.findAll({ where: { companyId }, order: [['code', 'ASC'], ['version', 'DESC']], transaction }),
    );
  }

  async createPolicy(companyId: number, actorUserId: number, input: PolicyInput) {
    this.validatePolicy(input);
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const latest = await LoanPolicyModel.findOne({
        where: { companyId, code: input.code },
        order: [['version', 'DESC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (latest?.active) await latest.update({ active: false, effectiveTo: input.effectiveFrom }, { transaction });
      const policy = await LoanPolicyModel.create(
        {
          id: randomUUID(),
          companyId,
          ...input,
          version: (latest?.version ?? 0) + 1,
          effectiveTo: null,
          active: true,
          createdBy: actorUserId,
          createdAt: now(),
        },
        { transaction },
      );
      await this.event(transaction, companyId, policy.id, 'loans.policy.created', { code: policy.code, version: policy.version });
      return policy;
    });
  }

  async simulate(companyId: number, input: {
    requestedAmount: string;
    currency: string;
    installmentCount: number;
    firstDueDate: string;
    frequency: Frequency;
    loanType?: LoanType;
    annualInterestBps?: number;
  }) {
    return withTenant(companyId, async (transaction) => {
      const policy = await this.findPolicy(companyId, today(), transaction, input.loanType);
      if (!policy) throw new ConflictError('An active loan policy is required for simulations.');
      if (input.loanType && !policy.allowedTypes.includes(input.loanType)) {
        throw new ValidationError('This loan type is not enabled by the active policy.');
      }
      if (input.currency !== 'AOA') throw new ValidationError('Loan currency must be AOA until the company policy explicitly supports another currency.');
      if (toCents(input.requestedAmount) > toCents(policy.maxAmount)) throw new ValidationError('Amount exceeds active policy maximum.');
      if (input.installmentCount > policy.maxInstallments) throw new ValidationError('Installment count exceeds active policy maximum.');
      const interestBps = input.annualInterestBps ?? 0;
      if ((!policy.interestAllowed && interestBps !== 0) || interestBps > policy.maxAnnualInterestBps) {
        throw new ValidationError('Requested interest rate is not enabled by the active policy.');
      }
      const installments = this.planGenerator.generate({
        principal: input.requestedAmount,
        currency: input.currency,
        installmentCount: input.installmentCount,
        firstDueDate: input.firstDueDate,
        frequency: input.frequency,
        annualInterestBps: interestBps,
      });
      return {
        totalAmount: centsToString(installments.reduce((sum, item) => sum + toCents(item.totalDue), 0n)),
        installments,
        policyVersion: policy.version,
      };
    });
  }

  async summary(companyId: number) {
    return withTenant(companyId, async (transaction) => {
      const loans = await EmployeeLoanModel.findAll({
        where: { companyId, status: { [Op.in]: ['ACTIVE', 'SUSPENDED', 'PENDING_DISBURSEMENT', 'SETTLED'] } },
        transaction,
      });
      const result = { activeLoans: 0, outstandingPrincipal: 0n, outstandingInterest: 0n, currency: 'AOA' };
      for (const loan of loans) {
        if (loan.status === 'ACTIVE' || loan.status === 'SUSPENDED') result.activeLoans += 1;
        if (loan.currency !== result.currency) throw new ConflictError('Loan balances cannot be aggregated across currencies.');
        result.currency = loan.currency;
        const balance = await this.balance(companyId, loan.id, loan.currency, transaction);
        result.outstandingPrincipal += toCents(balance.principal);
        result.outstandingInterest += toCents(balance.interest);
      }
      return {
        activeLoans: result.activeLoans,
        currency: result.currency,
        outstandingPrincipal: centsToString(result.outstandingPrincipal),
        outstandingInterest: centsToString(result.outstandingInterest),
        outstandingTotal: centsToString(result.outstandingPrincipal + result.outstandingInterest),
      };
    });
  }

  async outstandingReport(companyId: number, query: { page: number; limit: number }) {
    return withTenant(companyId, async (transaction) => {
      const result = await EmployeeLoanModel.findAndCountAll({
        where: { companyId, status: { [Op.in]: ['ACTIVE', 'SUSPENDED'] } },
        order: [['createdAt', 'DESC']],
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        transaction,
      });
      const data = await Promise.all(result.rows.map(async (loan) => ({
        ...loan.toJSON(),
        balance: await this.balance(companyId, loan.id, loan.currency, transaction),
      })));
      return { data, total: result.count, page: query.page, limit: query.limit };
    });
  }

  async history(companyId: number, loanId: string) {
    return withTenant(companyId, async (transaction) => {
      const loan = await this.requireLoan(companyId, loanId, transaction);
      const ledger = await LoanLedgerEntryModel.findAll({
        where: { companyId, loanId },
        order: [['occurredAt', 'ASC']],
        transaction,
      });
      const approvals = await LoanApprovalModel.findAll({
        where: { companyId, applicationId: loan.applicationId },
        order: [['decidedAt', 'ASC']],
        transaction,
      });
      const disbursements = await LoanDisbursementModel.findAll({
        where: { companyId, loanId },
        order: [['createdAt', 'ASC']],
        transaction,
      });
      return { ledger, approvals, disbursements, balance: await this.balance(companyId, loanId, loan.currency, transaction) };
    });
  }

  async listLateInstallments(companyId: number, query: { page: number; limit: number }) {
    return withTenant(companyId, async (transaction) => {
      const activePlans = await RepaymentPlanModel.findAll({
        where: { companyId, status: 'ACTIVE' },
        attributes: ['id'],
        raw: true,
        transaction,
      });
      if (!activePlans.length) return { data: [], total: 0, page: query.page, limit: query.limit };
      const result = await LoanInstallmentModel.findAndCountAll({
        where: {
          companyId,
          planId: { [Op.in]: activePlans.map((plan) => plan.id) },
          dueDate: { [Op.lt]: today() },
          status: { [Op.in]: ['PENDING', 'PARTIALLY_PAID'] },
        },
        order: [['dueDate', 'ASC']],
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        transaction,
      });
      return { data: result.rows, total: result.count, page: query.page, limit: query.limit };
    });
  }

  private async createApprovedLoan(
    companyId: number,
    actorUserId: number,
    application: LoanApplicationModel,
    policy: LoanPolicyModel,
    transaction: Transaction,
  ): Promise<EmployeeLoanModel> {
    const loan = await EmployeeLoanModel.create(
      {
        id: randomUUID(),
        companyId,
        employeeId: application.employeeId,
        applicationId: application.id,
        loanNumber: `LN-${new Date().getUTCFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
        principalAmount: application.requestedAmount,
        currency: application.currency,
        status: 'PENDING_DISBURSEMENT',
        version: 1,
        disbursedAt: null,
        createdAt: now(),
        updatedAt: now(),
      },
      { transaction },
    );
    const interestBps = policy.interestAllowed ? application.annualInterestBps : 0;
    const plan = await this.createPlan(
      companyId,
      loan,
      application.requestedAmount,
      application.installmentCount,
      application.firstDueDate,
      application.frequency,
      interestBps,
      transaction,
    );
    await application.update({ status: 'APPROVED', version: application.version + 1, updatedAt: now() }, { transaction });
    await this.event(transaction, companyId, loan.id, 'loans.loan.created', {
      applicationId: application.id,
      loanNumber: loan.loanNumber,
      planId: plan.id,
    });
    return loan;
  }

  private async createPlan(
    companyId: number,
    loan: EmployeeLoanModel,
    principal: string,
    installmentCount: number,
    firstDueDate: string,
    frequency: Frequency,
    annualInterestBps: number,
    transaction: Transaction,
  ): Promise<RepaymentPlanModel> {
    const current = await RepaymentPlanModel.findOne({
      where: { companyId, loanId: loan.id },
      order: [['version', 'DESC']],
      transaction,
    });
    if (current?.status === 'ACTIVE') await current.update({ status: 'SUPERSEDED' }, { transaction });
    const installments = this.planGenerator.generate({
      principal: centsToString(toCents(principal)),
      currency: loan.currency,
      installmentCount,
      firstDueDate,
      frequency,
      annualInterestBps,
    });
    const total = installments.reduce((sum, item) => sum + toCents(item.totalDue), 0n);
    const plan = await RepaymentPlanModel.create(
      {
        id: randomUUID(),
        companyId,
        loanId: loan.id,
        version: (current?.version ?? 0) + 1,
        totalAmount: centsToString(total),
        installmentCount,
        effectiveFrom: firstDueDate,
        status: 'ACTIVE',
        createdAt: now(),
      },
      { transaction },
    );
    await LoanInstallmentModel.bulkCreate(
      installments.map((item) => ({
        id: randomUUID(),
        companyId,
        loanId: loan.id,
        planId: plan.id,
        installmentNumber: item.number,
        dueDate: item.dueDate,
        principalDue: item.principalDue,
        interestDue: item.interestDue,
        status: 'PENDING' as const,
      })),
      { transaction },
    );
    return plan;
  }

  private async registerRepaymentInTransaction(
    companyId: number,
    actorUserId: number,
    loanId: string,
    amount: string,
    source: string,
    externalReference: string,
    idempotencyKey: string,
    installmentId: string | null,
    transaction: Transaction,
  ): Promise<LoanRepaymentModel> {
    const existing = await LoanRepaymentModel.findOne({
      where: { companyId, source, idempotencyKey },
      transaction,
    });
    if (existing) {
      if (
        existing.loanId !== loanId ||
        existing.externalReference !== externalReference ||
        toCents(existing.amount) !== toCents(amount)
      ) {
        throw new ConflictError('Repayment idempotency key was already used for a different payment.');
      }
      return existing;
    }
    const loan = await this.requireLoan(companyId, loanId, transaction, true);
    const cents = toCents(amount);
    if (cents <= 0n) throw new ValidationError('Repayment amount must be positive.');
    const balance = await this.balance(companyId, loan.id, loan.currency, transaction);
    if (cents > toCents(balance.total)) throw new ConflictError('Repayment exceeds the outstanding loan balance.');
    const repayment = await LoanRepaymentModel.create(
      {
        id: randomUUID(),
        companyId,
        loanId,
        amount,
        currency: loan.currency,
        source,
        externalReference,
        idempotencyKey,
        status: 'CONFIRMED',
        createdBy: actorUserId,
        createdAt: now(),
      },
      { transaction },
    );
    await this.allocateRepayment(companyId, actorUserId, loan, repayment, cents, transaction, installmentId);
    const updatedBalance = await this.balance(companyId, loan.id, loan.currency, transaction);
    if (updatedBalance.total === '0.00') {
      await loan.update({ status: 'SETTLED', version: loan.version + 1, updatedAt: now() }, { transaction });
      const application = await this.requireApplication(companyId, loan.applicationId, transaction);
      await application.update({ status: 'SETTLED', version: application.version + 1, updatedAt: now() }, { transaction });
      await this.event(transaction, companyId, loan.id, 'loans.loan.settled', { repaymentId: repayment.id });
    }
    return repayment;
  }

  private async allocateRepayment(
    companyId: number,
    actorUserId: number,
    loan: EmployeeLoanModel,
    repayment: LoanRepaymentModel,
    amount: bigint,
    transaction: Transaction,
    onlyInstallmentId?: string | null,
  ): Promise<void> {
    const activePlan = await RepaymentPlanModel.findOne({
      where: { companyId, loanId: loan.id, status: 'ACTIVE' },
      order: [['version', 'DESC']],
      transaction,
    });
    if (!activePlan) throw new ConflictError('An active repayment plan is required to allocate repayments.');
    const installments = await LoanInstallmentModel.findAll({
      where: {
        companyId,
        loanId: loan.id,
        planId: activePlan.id,
        ...(onlyInstallmentId ? { id: onlyInstallmentId } : {}),
      },
      order: [['dueDate', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (onlyInstallmentId && !installments.length) throw new NotFoundError('Loan installment');
    let remaining = amount;
    for (const installment of installments) {
      if (remaining === 0n) break;
      const paid = await this.installmentPaid(companyId, installment.id, transaction);
      let interestOwed = toCents(installment.interestDue) - toCents(paid.interest);
      let principalOwed = toCents(installment.principalDue) - toCents(paid.principal);
      if (interestOwed < 0n || principalOwed < 0n) throw new ConflictError('Installment ledger is inconsistent.');
      const interestPayment = interestOwed < remaining ? interestOwed : remaining;
      remaining -= interestPayment;
      interestOwed -= interestPayment;
      const principalPayment = principalOwed < remaining ? principalOwed : remaining;
      remaining -= principalPayment;
      principalOwed -= principalPayment;
      if (interestPayment + principalPayment > 0n) {
        await LoanLedgerEntryModel.create(
          {
            id: randomUUID(),
            companyId,
            loanId: loan.id,
            installmentId: installment.id,
            entryType: 'REPAYMENT',
            principalAmount: centsToString(principalPayment),
            interestAmount: centsToString(interestPayment),
            currency: loan.currency,
            source: 'REPAYMENT',
            externalReference: repayment.id,
            idempotencyKey: `REPAYMENT:${repayment.id}:${installment.id}`,
            occurredAt: now(),
            createdBy: actorUserId,
          },
          { transaction },
        );
      }
      await installment.update({
        status: principalOwed === 0n && interestOwed === 0n ? 'PAID' : 'PARTIALLY_PAID',
      }, { transaction });
    }
    if (remaining > 0n) throw new ConflictError('Repayment exceeds unpaid amounts in the active plan.');
  }

  private async balance(companyId: number, loanId: string, currency: string, transaction: Transaction) {
    const entries = await LoanLedgerEntryModel.findAll({ where: { companyId, loanId }, transaction });
    let principal = 0n;
    let interest = 0n;
    for (const entry of entries) {
      const sign = entry.entryType === 'DISBURSEMENT' || entry.entryType === 'REVERSAL' ? 1n : -1n;
      principal += sign * toCents(entry.principalAmount);
      interest += sign * toCents(entry.interestAmount);
    }
    if (principal < 0n || interest < 0n) throw new ConflictError('Loan ledger balance cannot be negative.');
    return {
      principal: centsToString(principal),
      interest: centsToString(interest),
      total: centsToString(principal + interest),
      currency,
    };
  }

  private async installmentPaid(companyId: number, installmentId: string, transaction: Transaction) {
    const entries = await LoanLedgerEntryModel.findAll({
      where: { companyId, installmentId },
      transaction,
    });
    let principal = 0n;
    let interest = 0n;
    for (const entry of entries) {
      const sign = entry.entryType === 'REPAYMENT' ? 1n : entry.entryType === 'REVERSAL' ? -1n : 0n;
      principal += sign * toCents(entry.principalAmount);
      interest += sign * toCents(entry.interestAmount);
    }
    return {
      principal: centsToString(principal),
      interest: centsToString(interest),
      total: centsToString(principal + interest),
    };
  }

  private async getEmployeeOutstanding(companyId: number, employeeId: string, transaction: Transaction): Promise<bigint> {
    const loans = await EmployeeLoanModel.findAll({
      where: { companyId, employeeId, status: { [Op.in]: ['ACTIVE', 'SUSPENDED', 'PENDING_DISBURSEMENT'] } },
      transaction,
    });
    let total = 0n;
    for (const loan of loans) {
      if (loan.status === 'PENDING_DISBURSEMENT') {
        total += toCents(loan.principalAmount);
      } else {
        total += toCents((await this.balance(companyId, loan.id, loan.currency, transaction)).total);
      }
    }
    return total;
  }

  private async findPolicy(companyId: number, date: string, transaction: Transaction, loanType?: LoanType) {
    const policies = await LoanPolicyModel.findAll({
      where: {
        companyId,
        active: true,
        effectiveFrom: { [Op.lte]: date },
        [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: date } }],
      },
      order: [['effectiveFrom', 'DESC'], ['version', 'DESC'], ['createdAt', 'DESC']],
      transaction,
    });
    return policies.find((policy) => !loanType || policy.allowedTypes.includes(loanType)) ?? null;
  }

  private validateApplication(input: ApplicationInput): void {
    Money.create(input.requestedAmount, input.currency);
    if (toCents(input.requestedAmount) <= 0n) throw new ValidationError('Requested amount must be greater than zero.');
    if (!['LOAN', 'SALARY_ADVANCE', 'EXTRAORDINARY_ADVANCE'].includes(input.loanType)) {
      throw new ValidationError('Unsupported loan type.');
    }
    if (!['MONTHLY', 'BIWEEKLY', 'WEEKLY'].includes(input.frequency)) {
      throw new ValidationError('Unsupported repayment frequency.');
    }
    if (!Number.isInteger(input.installmentCount) || input.installmentCount < 1 || input.installmentCount > 120) {
      throw new ValidationError('Installment count must be between 1 and 120.');
    }
    if (!dateIsValid(input.firstDueDate)) throw new ValidationError('A valid first due date is required.');
    if (!input.reason.trim()) throw new ValidationError('Application reason is required.');
    if (!Number.isInteger(input.annualInterestBps ?? 0) || (input.annualInterestBps ?? 0) < 0) {
      throw new ValidationError('Interest rate must be provided in basis points.');
    }
  }

  private validateAgainstPolicy(input: ApplicationInput, policy: LoanPolicyModel): void {
    if (!policy.allowedTypes.includes(input.loanType)) throw new ValidationError('This loan type is not enabled by the active policy.');
    if (toCents(input.requestedAmount) > toCents(policy.maxAmount)) throw new ValidationError('Requested amount exceeds the active policy maximum.');
    if (input.installmentCount > policy.maxInstallments) throw new ValidationError('Installment count exceeds the active policy maximum.');
    if ((!policy.interestAllowed && (input.annualInterestBps ?? 0) !== 0) ||
      (input.annualInterestBps ?? 0) > policy.maxAnnualInterestBps) {
      throw new ValidationError('Interest rate is not enabled by the active policy.');
    }
    if (input.currency !== 'AOA') throw new ValidationError('Loan currency must be AOA until the company policy explicitly supports another currency.');
  }

  private validatePolicy(input: PolicyInput): void {
    if (!input.code.trim() || !dateIsValid(input.effectiveFrom)) throw new ValidationError('Policy code and effective date are required.');
    if (toCents(input.maxAmount) <= 0n) throw new ValidationError('Policy maximum amount must be positive.');
    if (!Number.isInteger(input.maxInstallments) || input.maxInstallments < 1 || input.maxInstallments > 120) {
      throw new ValidationError('Policy maximum installments must be between 1 and 120.');
    }
    if (!Number.isInteger(input.maxActiveLoans) || input.maxActiveLoans < 1 || input.maxActiveLoans > 100) {
      throw new ValidationError('Policy maximum active loans must be between 1 and 100.');
    }
    if (!input.allowedTypes.length) throw new ValidationError('At least one loan type must be enabled.');
    if (!input.interestAllowed && input.maxAnnualInterestBps !== 0) {
      throw new ValidationError('Interest must be disabled or have an explicit permitted maximum rate.');
    }
    if (!Number.isInteger(input.maxAnnualInterestBps) || input.maxAnnualInterestBps < 0) {
      throw new ValidationError('Maximum interest must be expressed as non-negative basis points.');
    }
  }

  private async requireEmployee(companyId: number, employeeId: string, transaction: Transaction) {
    const employee = await EmployeeModel.findOne({
      where: { id: employeeId, companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!employee) throw new NotFoundError('Employee');
    return employee;
  }

  private async requireEligibleEmployee(companyId: number, employeeId: string, transaction: Transaction) {
    const employee = await this.requireEmployee(companyId, employeeId, transaction);
    if (employee.status !== 'ACTIVE') throw new ConflictError('Only active employees may receive a new loan.');
    const contract = await EmploymentContractModel.findOne({
      where: {
        companyId,
        employeeId,
        status: 'ACTIVE',
        startDate: { [Op.lte]: today() },
        [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: today() } }],
      },
      order: [['startDate', 'DESC']],
      transaction,
    });
    if (!contract) throw new ConflictError('An active employment contract is required for loan eligibility.');
    return { employee, contract };
  }

  private async requireApplication(companyId: number, id: string, transaction: Transaction, lock = false) {
    const application = await LoanApplicationModel.findOne({
      where: { companyId, id },
      transaction,
      ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!application) throw new NotFoundError('Loan application');
    return application;
  }

  private async requireLoan(companyId: number, id: string, transaction: Transaction, lock = false) {
    const loan = await EmployeeLoanModel.findOne({
      where: { companyId, id },
      transaction,
      ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!loan) throw new NotFoundError('Employee loan');
    return loan;
  }

  private async lockCompany(companyId: number, transaction: Transaction): Promise<void> {
    const company = await CompanyModel.findByPk(companyId, {
      attributes: ['id'],
      transaction,
      ...(sequelize.getDialect() === 'sqlite' ? {} : { lock: transaction.LOCK.UPDATE }),
    });
    if (!company) throw new NotFoundError('Company');
  }

  private async event(
    transaction: Transaction,
    companyId: number,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await LoanOutboxModel.create(
      { companyId, aggregateId, eventType, payload, occurredAt: now(), publishedAt: null },
      { transaction },
    );
  }
}
