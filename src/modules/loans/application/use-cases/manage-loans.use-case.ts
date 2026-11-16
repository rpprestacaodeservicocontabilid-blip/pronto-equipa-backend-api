import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { LoansRepositoryPort } from '../ports/loans.repository.port';

export class ManageLoansUseCase {
  constructor(
    private readonly repository: LoansRepositoryPort,
    private readonly audit: AuditRecorderPort,
  ) {}

  async execute<T>(
    companyId: number,
    actorUserId: number,
    action: string,
    entityType: string,
    operation: (repository: LoansRepositoryPort) => Promise<T>,
  ): Promise<T> {
    const result = await operation(this.repository);
    const record =
      result && typeof result === 'object'
        ? (result as {
            id?: string | number;
            status?: string;
            loan?: { id?: string | number; status?: string };
          })
        : {};
    const status = record.status ?? record.loan?.status;
    await this.audit.record({
      companyId,
      actorUserId,
      action,
      entityType,
      entityId: record.id ?? record.loan?.id,
      after: status ? { status } : null,
    });
    return result;
  }

  query<T>(operation: (repository: LoansRepositoryPort) => Promise<T>): Promise<T> {
    return operation(this.repository);
  }
}
