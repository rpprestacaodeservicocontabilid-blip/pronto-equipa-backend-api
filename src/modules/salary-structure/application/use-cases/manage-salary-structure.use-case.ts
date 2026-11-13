import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { SequelizeSalaryStructureRepository } from '../../infrastructure/persistence/repositories/sequelize-salary-structure.repository';

export class ManageSalaryStructureUseCase {
  constructor(
    private readonly repository: SequelizeSalaryStructureRepository,
    private readonly audit: AuditRecorderPort,
  ) {}

  async execute<T>(
    companyId: number,
    actorUserId: number,
    action: string,
    entityType: string,
    operation: (repository: SequelizeSalaryStructureRepository) => Promise<T>,
  ): Promise<T> {
    const result = await operation(this.repository);
    const record =
      result && typeof result === 'object'
        ? (result as {
            id?: string | number;
            status?: string;
            component?: { id?: string };
            table?: { id?: string };
            structure?: { id?: string };
            version?: { id?: string };
          })
        : {};
    await this.audit.record({
      companyId,
      actorUserId,
      action,
      entityType,
      entityId:
        record.id ??
        record.component?.id ??
        record.table?.id ??
        record.structure?.id ??
        record.version?.id,
      after: record.status ? { status: record.status } : null,
    });
    return result;
  }

  query<T>(operation: (repository: SequelizeSalaryStructureRepository) => Promise<T>): Promise<T> {
    return operation(this.repository);
  }
}
