import { LegalSourceInput } from '../../domain/legal-governance';
import { LegalRuleSetStatus } from '../../domain/legal-rule-set-status';
import { LegalRuleSetInput } from '../../domain/legal-rule-set';

/** Public persistence contract. ORM instances stay in the adapter. */
export interface LegalRulesRepositoryPort {
  list(options?: {
    status?: LegalRuleSetStatus;
    companyId?: number;
    jurisdiction?: string;
    page?: number;
    limit?: number;
  }): Promise<unknown>;
  getView(id: string): Promise<unknown>;
  listSources(page: number, limit: number): Promise<unknown>;
  registerSource(input: LegalSourceInput, actorId: number): Promise<unknown>;
  create(input: LegalRuleSetInput, actorId: number): Promise<unknown>;
  update(
    id: string,
    patch: Partial<
      Pick<
        LegalRuleSetInput,
        'effectiveFrom' | 'effectiveTo' | 'sourceReference' | 'evidenceReference' | 'rules' | 'governance'
      >
    > & { expectedUpdatedAt?: string },
    actorId: number,
  ): Promise<unknown>;
  reject(id: string, actorId: number, reason: string, expectedUpdatedAt?: string): Promise<unknown>;
  submit(id: string, actorId: number, expectedUpdatedAt?: string): Promise<unknown>;
  approve(id: string, actorId: number, expectedUpdatedAt?: string): Promise<unknown>;
  publish(id: string, actorId: number, expectedUpdatedAt?: string): Promise<unknown>;
  retire(id: string, actorId: number, expectedUpdatedAt?: string): Promise<unknown>;
  resolve(companyId: number, startDate: string, endDate: string): Promise<unknown>;
}
