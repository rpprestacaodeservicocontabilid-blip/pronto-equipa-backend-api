import { NotFoundError, ValidationError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import {
  EmployeeDetailsRepository,
  EmployeeBankAccountInput,
  EmployeeDependentInput,
} from '../ports/employee-details.repository';
import { BankAccount } from '../../domain/value-objects/bank-account.vo';

export class ListEmployeeDependentsUseCase {
  constructor(private readonly repository: EmployeeDetailsRepository) {}

  async execute(companyId: number, employeeId: string) {
    const dependents = await this.repository.listDependents(companyId, employeeId);
    if (!dependents) throw new NotFoundError('Employee');
    return dependents;
  }
}

export class AddEmployeeDependentUseCase {
  constructor(
    private readonly repository: EmployeeDetailsRepository,
    private readonly audit: AuditRecorderPort,
  ) {}

  async execute(input: EmployeeDependentInput & { actorUserId: number }) {
    if (!input.fullName.trim() || !input.relationship.trim()) {
      throw new ValidationError('Dependent name and relationship are required.');
    }
    const dependent = await this.repository.addDependent(input);
    if (!dependent) throw new NotFoundError('Employee');

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'employee.dependent.added',
      entityType: 'employee_dependent',
      entityId: dependent.id,
      after: { employeeId: input.employeeId, relationship: dependent.relationship },
    });
    return dependent;
  }
}

export class GetEmployeeBankAccountUseCase {
  constructor(private readonly repository: EmployeeDetailsRepository) {}

  async execute(companyId: number, employeeId: string) {
    return this.repository.getBankAccount(companyId, employeeId);
  }
}

export class SetEmployeeBankAccountUseCase {
  constructor(
    private readonly repository: EmployeeDetailsRepository,
    private readonly audit: AuditRecorderPort,
  ) {}

  async execute(input: EmployeeBankAccountInput & { actorUserId: number }) {
    let account: BankAccount;
    try {
      account = new BankAccount(input);
    } catch (error) {
      if (error instanceof Error) throw new ValidationError(error.message);
      throw error;
    }
    const saved = await this.repository.setBankAccount({
      companyId: input.companyId,
      employeeId: input.employeeId,
      bankName: account.bankName,
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      iban: account.iban,
      currency: input.currency,
    });
    if (!saved) throw new NotFoundError('Employee');

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'employee.bank_account.updated',
      entityType: 'employee_bank_account',
      entityId: input.employeeId,
      after: { changed: true },
    });
    return { updated: true };
  }
}
