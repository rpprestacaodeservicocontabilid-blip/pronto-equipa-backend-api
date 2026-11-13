import {
  EmployeeListQuery,
  EmployeeRepository,
} from '../../domain/repositories/employee.repository';

export class ListEmployeesUseCase {
  constructor(private readonly repository: EmployeeRepository) {}

  execute(companyId: number, query: EmployeeListQuery) {
    return this.repository.list(companyId, query);
  }
}
