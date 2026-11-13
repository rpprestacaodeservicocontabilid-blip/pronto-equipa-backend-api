import { NotFoundError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { EmployeeRepository } from '../../domain/repositories/employee.repository';

export class TransferEmployeeUseCase {
  constructor(
    private readonly repository: EmployeeRepository,
    private readonly audit: AuditRecorderPort,
  ) {}

  async execute(input: {
    companyId: number;
    employeeId: string;
    actorUserId: number;
    departmentId: number | null;
    jobTitle: string | null;
    jobCategory: string | null;
    effectiveFrom: Date;
    reason: string;
  }) {
    const history = await this.repository.transfer(input);
    if (!history) throw new NotFoundError('Employee');

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'employee.transferred',
      entityType: 'employee',
      entityId: input.employeeId,
      after: {
        departmentId: input.departmentId,
        jobTitle: input.jobTitle,
        jobCategory: input.jobCategory,
        effectiveFrom: input.effectiveFrom.toISOString(),
      },
    });
    return history;
  }
}
