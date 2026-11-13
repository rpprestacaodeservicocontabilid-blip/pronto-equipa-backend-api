import { ValidationError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { EmployeeEntity, CreateEmployeeInput } from '../../domain/entities/employee.entity';
import { EmployeeRepository } from '../../domain/repositories/employee.repository';

export class CreateEmployeeUseCase {
  constructor(
    private readonly repository: EmployeeRepository,
    private readonly audit: AuditRecorderPort,
  ) {}

  async execute(input: CreateEmployeeInput & { actorUserId: number }) {
    let employee: EmployeeEntity;
    try {
      employee = EmployeeEntity.create(input);
    } catch (error) {
      if (error instanceof Error) throw new ValidationError(error.message);
      throw error;
    }

    const created = await this.repository.create(employee, input.actorUserId);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'employee.created',
      entityType: 'employee',
      entityId: created.id,
      after: { employeeNumber: created.employeeNumber, status: created.status },
    });
    return created;
  }
}
