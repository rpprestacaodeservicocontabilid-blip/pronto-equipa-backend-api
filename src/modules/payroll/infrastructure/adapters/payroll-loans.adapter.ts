import { Transaction } from 'sequelize';
import { ConflictError, ValidationError } from '../../../../shared/errors/app.error';
import { LoanDeductionModel } from '../../../loans/infrastructure/persistence/model/loan-deduction.model';
import { SequelizeLoansRepository } from '../../../loans/infrastructure/persistence/repositories/sequelize-loans.repository';
import { PayrollCalculationResult, PayrollInputSnapshot } from '../../application/ports/payroll-calculator.port';
import { cents } from '../../domain/payroll-result';

export async function reservePayrollLoanDeductions(companyId: number, runId: string, snapshot: PayrollInputSnapshot, result: PayrollCalculationResult, transaction: Transaction, simulation = false) {
  const captured = Array.isArray(snapshot.data.loanDeductions) ? snapshot.data.loanDeductions as Array<Record<string, unknown>> : [];
  const reserved: LoanDeductionModel[] = [];
  const seen = new Set<string>();
  for (const line of result.lines) {
    if (line.code.startsWith('LOAN_') && !line.sourceReference.startsWith('loan-deduction:')) throw new ValidationError('Loan deductions require a reserved loans reference.');
    if (!line.sourceReference.startsWith('loan-deduction:')) continue;
    if (line.type !== 'DEDUCTION') throw new ValidationError('Loan references can only be used by deduction lines.');
    const id = line.sourceReference.slice('loan-deduction:'.length);
    if (seen.has(id)) throw new ConflictError('A loan deduction cannot appear twice in a result.');
    seen.add(id);
    if (!captured.some(row => row.id === id)) throw new ConflictError('Loan deduction was not present in the input snapshot.');
    const deduction = await LoanDeductionModel.findOne({ where: { companyId, id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!deduction || deduction.status !== 'REQUESTED' || (deduction.payrollRunId && deduction.payrollRunId !== runId) || cents(line.amount) <= 0n || cents(line.amount) > cents(String(deduction.requestedAmount))) throw new ConflictError('Loan deduction is unavailable or exceeds the authorized amount.');
    reserved.push(deduction);
  }
  if (!simulation) for (const deduction of reserved) await deduction.update({ payrollRunId: runId }, { transaction });
}
export async function settlePayrollLoanDeductions(companyId: number, runId: string, actor: number, results: Array<Record<string, unknown>>) {
  const repository = new SequelizeLoansRepository();
  for (const result of results) {
    const snapshot = result.calculationSnapshot as PayrollCalculationResult;
    for (const line of snapshot.lines) {
      if (!line.sourceReference.startsWith('loan-deduction:')) continue;
      const id = line.sourceReference.slice('loan-deduction:'.length);
      // confirmDeduction is idempotent; reservation was committed atomically
      // with the employee calculation and cannot belong to another run.
      await repository.confirmDeduction(companyId, actor, id, { payrollRunId: runId, confirmedAmount: line.amount, idempotencyKey: `payroll:${runId}:${id}` });
    }
  }
}
