import { NotFoundError } from '../../../../shared/errors/app.error';
import { EmployeeRepository } from '../../domain/repositories/employee.repository';

export class GetEmployeeSnapshotUseCase {
  constructor(private readonly repository: EmployeeRepository) {}

  async execute(companyId: number, employeeId: string, asOf: Date) {
    const snapshot = await this.repository.snapshotAsOf(companyId, employeeId, asOf);
    if (!snapshot) throw new NotFoundError('Employee snapshot');
    return snapshot;
  }
}
