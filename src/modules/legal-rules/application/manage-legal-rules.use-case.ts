import { AuditRecorderPort } from '../../audit/application/ports/audit-recorder.port';
import { SequelizeLegalRulesRepository } from '../infrastructure/persistence/sequelize-legal-rules.repository';

export class ManageLegalRulesUseCase {
  constructor(private readonly repository: SequelizeLegalRulesRepository, private readonly audit: AuditRecorderPort) {}

  query<T>(operation: (repository: SequelizeLegalRulesRepository) => Promise<T>) {
    return operation(this.repository);
  }

  async execute<T>(actorUserId: number, action: string, operation: (repository: SequelizeLegalRulesRepository) => Promise<T>): Promise<T> {
    const result = await operation(this.repository);
    const record = result && typeof result === 'object' ? result as { id?: string; status?: string; ruleSetId?: string; version?: string } : {};
    await this.audit.record({
      companyId: null,
      actorUserId,
      action: `legal-rules.${action}`,
      entityType: 'legal_rule_set',
      entityId: record.id ?? null,
      after: { status: record.status, ruleSetId: record.ruleSetId, version: record.version },
    });
    return result;
  }
}
