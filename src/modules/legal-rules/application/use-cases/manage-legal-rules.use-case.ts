import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { LegalRulesRepositoryPort } from '../ports/legal-rules.repository.port';

export class ManageLegalRulesUseCase {
  constructor(
    private readonly repository: LegalRulesRepositoryPort,
    private readonly audit: AuditRecorderPort,
  ) {}

  query<T>(operation: (repository: LegalRulesRepositoryPort) => Promise<T>) {
    return operation(this.repository);
  }

  async execute<T>(
    actorUserId: number,
    action: string,
    operation: (repository: LegalRulesRepositoryPort) => Promise<T>,
    entityType = 'legal_rule_set',
  ): Promise<T> {
    const result = await operation(this.repository);
    const record =
      result && typeof result === 'object'
        ? (result as { id?: string; status?: string; ruleSetId?: string; version?: string })
        : {};
    await this.audit.record({
      companyId: null,
      actorUserId,
      action: `legal-rules.${action}`,
      entityType,
      entityId: record.id ?? null,
      after: { status: record.status, ruleSetId: record.ruleSetId, version: record.version },
    });
    return result;
  }
}
