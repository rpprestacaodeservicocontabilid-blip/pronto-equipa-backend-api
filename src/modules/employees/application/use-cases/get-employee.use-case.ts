import { NotFoundError } from '../../../../shared/errors/app.error';
import { EmployeeRepository } from '../../domain/repositories/employee.repository';

export class GetEmployeeUseCase {
  constructor(private readonly repository: EmployeeRepository) {}

  async execute(companyId: number, employeeId: string) {
    const employee = await this.repository.findById(companyId, employeeId);
    if (!employee) throw new NotFoundError('Employee');
    return employee;
  }
}
