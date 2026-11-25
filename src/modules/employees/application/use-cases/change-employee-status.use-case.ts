import { NotFoundError, ValidationError } from '../../../../shared/errors/app.error';
import { EmployeeRepository } from '../../domain/repositories/employee.repository';
import { EmployeeStatusValue } from '../../domain/value-objects/employee-status.vo';

export class ChangeEmployeeStatusUseCase {
  constructor(
    private readonly repository: EmployeeRepository,
  ) {}

  async execute(input: {
    companyId: number;
    employeeId: string;
    actorUserId: number;
    status: EmployeeStatusValue;
    effectiveAt: Date;
    reason: string;
    operation?: 'status' | 'termination' | 'rehire';
    terminationReason?: string;
  }) {
    if (input.status === 'TERMINATED' && !input.terminationReason?.trim()) {
      throw new ValidationError('A termination reason is required.');
    }
    const employee = await this.repository.changeStatus(input);
    if (!employee) throw new NotFoundError('Employee');

    return employee;
  }
}
