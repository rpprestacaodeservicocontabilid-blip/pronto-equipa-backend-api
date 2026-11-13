import { NotFoundError } from '../../../../shared/errors/app.error';
import { EmployeeRepository } from '../../domain/repositories/employee.repository';

export class GetEmployeeHistoryUseCase {
  constructor(private readonly repository: EmployeeRepository) {}

  async execute(companyId: number, employeeId: string) {
    const history = await this.repository.listHistory(companyId, employeeId);
    if (!history) throw new NotFoundError('Employee');
    return history;
  }
}
