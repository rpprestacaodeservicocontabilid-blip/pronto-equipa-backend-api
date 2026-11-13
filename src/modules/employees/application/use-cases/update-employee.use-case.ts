import { NotFoundError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { EmployeeEntity } from '../../domain/entities/employee.entity';
import { EmployeeRepository } from '../../domain/repositories/employee.repository';

export class UpdateEmployeeUseCase {
  constructor(
    private readonly repository: EmployeeRepository,
    private readonly audit: AuditRecorderPort,
  ) {}

  async execute(input: {
    companyId: number;
    employeeId: string;
    actorUserId: number;
    changes: Partial<
      Pick<
        EmployeeEntity,
        'firstName' | 'lastName' | 'dateOfBirth' | 'nationality' | 'email' | 'phone'
      >
    >;
  }) {
    const employee = await this.repository.update(
      input.companyId,
      input.employeeId,
      input.changes,
      input.actorUserId,
    );
    if (!employee) throw new NotFoundError('Employee');

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'employee.updated',
      entityType: 'employee',
      entityId: input.employeeId,
      after: { changedFields: Object.keys(input.changes) },
    });
    return employee;
  }
}
