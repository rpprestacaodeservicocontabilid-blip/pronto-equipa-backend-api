import { LegalRuleSetInput } from '../../domain/legal-rule-set';

/** Public persistence contract. ORM instances stay in the adapter. */
export interface LegalRulesRepositoryPort {
  list(options?: {
    status?: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'RETIRED';
    companyId?: number;
    jurisdiction?: string;
    page?: number;
    limit?: number;
  }): Promise<unknown>;
  getView(id: string): Promise<unknown>;
  create(input: LegalRuleSetInput, actorId: number): Promise<unknown>;
  update(
    id: string,
    patch: Partial<
      Pick<
        LegalRuleSetInput,
        'effectiveFrom' | 'effectiveTo' | 'sourceReference' | 'evidenceReference' | 'rules'
      >
    >,
    actorId: number,
  ): Promise<unknown>;
  submit(id: string, actorId: number): Promise<unknown>;
  approve(id: string, actorId: number): Promise<unknown>;
  publish(id: string, actorId: number): Promise<unknown>;
  retire(id: string, actorId: number): Promise<unknown>;
  resolve(companyId: number, startDate: string, endDate: string): Promise<unknown>;
}
