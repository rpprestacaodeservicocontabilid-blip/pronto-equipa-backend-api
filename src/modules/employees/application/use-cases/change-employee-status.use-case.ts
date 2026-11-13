import { NotFoundError, ValidationError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { EmployeeRepository } from '../../domain/repositories/employee.repository';
import { EmployeeStatusValue } from '../../domain/value-objects/employee-status.vo';

export class ChangeEmployeeStatusUseCase {
  constructor(
    private readonly repository: EmployeeRepository,
    private readonly audit: AuditRecorderPort,
  ) {}

  async execute(input: {
    companyId: number;
    employeeId: string;
    actorUserId: number;
    status: EmployeeStatusValue;
    effectiveAt: Date;
    reason: string;
    terminationReason?: string;
  }) {
    if (input.status === 'TERMINATED' && !input.terminationReason?.trim()) {
      throw new ValidationError('A termination reason is required.');
    }
    const before = await this.repository.findById(input.companyId, input.employeeId);
    if (!before) throw new NotFoundError('Employee');
    const employee = await this.repository.changeStatus(input);
    if (!employee) throw new NotFoundError('Employee');

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action:
        input.status === 'TERMINATED'
          ? 'employee.terminated'
          : before.status === 'TERMINATED' && input.status === 'ACTIVE'
            ? 'employee.rehired'
            : 'employee.status.changed',
      entityType: 'employee',
      entityId: input.employeeId,
      after: { status: input.status, effectiveAt: input.effectiveAt.toISOString() },
    });
    return employee;
  }
}
