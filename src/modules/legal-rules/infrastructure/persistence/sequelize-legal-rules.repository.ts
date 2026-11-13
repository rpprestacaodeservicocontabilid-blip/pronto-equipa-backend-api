import { randomUUID } from 'crypto';
import { Op, Transaction } from 'sequelize';
import { sequelize } from '../../../../infra/database';
import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/errors/app.error';
import { hashLegalRules, LegalRuleDefinition, LegalRuleSetInput, validateLegalRuleSet } from '../../domain/legal-rule-set';
import { LegalRuleSetModel, LegalRuleSetStatus } from './legal-rule-set.model';

type ListOptions = { status?: LegalRuleSetStatus; companyId?: number; jurisdiction?: string; page?: number; limit?: number };

export class SequelizeLegalRulesRepository {
  async list(options: ListOptions = {}) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const where = {
      ...(options.status ? { status: options.status } : {}),
      ...(options.jurisdiction ? { jurisdiction: options.jurisdiction } : {}),
      ...(options.companyId ? { [Op.or]: [{ companyId: options.companyId }, { companyId: null }] } : {}),
    };
    const result = await LegalRuleSetModel.findAndCountAll({
      where, order: [['updatedAt', 'DESC'], ['id', 'ASC']], limit, offset: (page - 1) * limit,
    });
    return { items: result.rows.map((row) => row.toJSON()), page, limit, total: result.count };
  }

  async get(id: string) {
    const row = await LegalRuleSetModel.findByPk(id);
    if (!row) throw new NotFoundError('Legal rule set');
    return row;
  }

  async create(input: LegalRuleSetInput, actorId: number) {
    const rules = validateLegalRuleSet(input);
    const companyId = input.companyId ?? null;
    const now = new Date();
    try {
      const row = await LegalRuleSetModel.create({
        id: randomUUID(), companyId, scopeKey: this.scopeKey(companyId), ruleSetId: input.ruleSetId.trim(),
        version: input.version.trim(), jurisdiction: input.jurisdiction, effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo, sourceReference: input.sourceReference.trim(),
        evidenceReference: input.evidenceReference.trim(), rules: rules as unknown as Record<string, unknown>,
        integrityHash: null, status: 'DRAFT', createdBy: actorId, submittedBy: null, submittedAt: null,
        approvedBy: null, approvedAt: null, publishedBy: null, publishedAt: null, retiredBy: null,
        retiredAt: null, createdAt: now, updatedAt: now,
      });
      return row.toJSON();
    } catch (error) { this.mapUnique(error); }
  }

  async update(id: string, patch: Partial<Pick<LegalRuleSetInput, 'effectiveFrom' | 'effectiveTo' | 'sourceReference' | 'evidenceReference' | 'rules'>>, actorId: number) {
    const row = await this.get(id);
    if (row.status !== 'DRAFT') throw new ConflictError('Only draft legal rule sets can be edited. Create a new version after submission.');
    const candidate: LegalRuleSetInput = {
      companyId: row.companyId, ruleSetId: row.ruleSetId, version: row.version, jurisdiction: row.jurisdiction as 'AO',
      effectiveFrom: patch.effectiveFrom ?? row.effectiveFrom, effectiveTo: patch.effectiveTo === undefined ? row.effectiveTo : patch.effectiveTo,
      sourceReference: patch.sourceReference ?? row.sourceReference, evidenceReference: patch.evidenceReference ?? row.evidenceReference,
      rules: (patch.rules ?? row.rules) as unknown as LegalRuleDefinition,
    };
    const rules = validateLegalRuleSet(candidate);
    await row.update({
      effectiveFrom: candidate.effectiveFrom, effectiveTo: candidate.effectiveTo,
      sourceReference: candidate.sourceReference.trim(), evidenceReference: candidate.evidenceReference.trim(),
      rules: rules as unknown as Record<string, unknown>, updatedAt: new Date(),
    });
    return row.toJSON();
  }

  async submit(id: string, actorId: number) {
    const row = await this.get(id);
    if (row.status !== 'DRAFT') throw new ConflictError('Only draft legal rule sets can be submitted.');
    validateLegalRuleSet(this.inputFrom(row));
    await row.update({ status: 'IN_REVIEW', submittedBy: actorId, submittedAt: new Date(), updatedAt: new Date() });
    return row.toJSON();
  }

  async approve(id: string, actorId: number) {
    const row = await this.get(id);
    if (row.status !== 'IN_REVIEW') throw new ConflictError('Only legal rule sets in review can be approved.');
    if (row.createdBy === actorId || row.submittedBy === actorId)
      throw new ConflictError('The creator or submitter cannot approve this legal rule set.');
    await row.update({ status: 'APPROVED', approvedBy: actorId, approvedAt: new Date(), updatedAt: new Date() });
    return row.toJSON();
  }

  async publish(id: string, actorId: number) {
    return sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
      const row = await LegalRuleSetModel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw new NotFoundError('Legal rule set');
      if (row.status !== 'APPROVED') throw new ConflictError('Only approved legal rule sets can be published.');
      const overlap = await LegalRuleSetModel.findOne({
        where: {
          id: { [Op.ne]: row.id }, scopeKey: row.scopeKey, jurisdiction: row.jurisdiction, status: 'PUBLISHED',
          effectiveFrom: { [Op.lte]: row.effectiveTo ?? '9999-12-31' },
          [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: row.effectiveFrom } }],
        }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (overlap) throw new ConflictError(`Effective dates overlap published rule set ${overlap.ruleSetId} ${overlap.version}.`);
      const integrityHash = hashLegalRules(this.engineRules(row));
      await row.update({ status: 'PUBLISHED', integrityHash, publishedBy: actorId, publishedAt: new Date(), updatedAt: new Date() }, { transaction });
      return row.toJSON();
    });
  }

  async retire(id: string, actorId: number) {
    const row = await this.get(id);
    if (row.status !== 'PUBLISHED') throw new ConflictError('Only published legal rule sets can be retired.');
    await row.update({ status: 'RETIRED', retiredBy: actorId, retiredAt: new Date(), updatedAt: new Date() });
    return row.toJSON();
  }

  async resolve(companyId: number, startDate: string, endDate: string) {
    if (!Number.isSafeInteger(companyId) || companyId <= 0 || !this.validDate(startDate) || !this.validDate(endDate) || startDate > endDate)
      throw new ValidationError('A valid company and date interval are required.');
    const overlapping = await LegalRuleSetModel.findAll({
      where: {
        jurisdiction: 'AO', status: 'PUBLISHED',
        effectiveFrom: { [Op.lte]: endDate },
        [Op.and]: [
          { scopeKey: { [Op.in]: [this.scopeKey(companyId), 'GLOBAL'] } },
          { [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: startDate } }] },
        ],
      },
      order: [['effectiveFrom', 'ASC']],
    });
    const relevant = overlapping.filter((row) => row.effectiveTo === null || row.effectiveTo >= startDate);
    const covers = (row: LegalRuleSetModel) => row.effectiveFrom <= startDate && (row.effectiveTo === null || row.effectiveTo >= endDate);
    const tenantRelevant = relevant.filter((row) => row.companyId === companyId);
    const tenant = tenantRelevant.filter(covers);
    const global = relevant.filter((row) => row.companyId === null && covers(row));
    const selected = tenantRelevant.length ? tenant : global;
    if (selected.length !== 1) {
      if (selected.length > 1) throw new ConflictError('More than one published legal rule set covers this interval.');
      throw new ConflictError('No single published legal rule set covers the complete payroll interval. Split the period at legal effective-date boundaries or publish a complete covering rule set.');
    }
    const row = selected[0];
    return {
      ruleSetId: row.ruleSetId, version: row.version, status: 'PUBLISHED' as const,
      effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo,
      sourceReference: row.sourceReference, integrityHash: row.integrityHash ?? undefined,
      rules: this.engineRules(row),
    };
  }

  private inputFrom(row: LegalRuleSetModel): LegalRuleSetInput {
    return {
      companyId: row.companyId, ruleSetId: row.ruleSetId, version: row.version,
      jurisdiction: row.jurisdiction as 'AO', effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo,
      sourceReference: row.sourceReference, evidenceReference: row.evidenceReference,
      rules: row.rules as unknown as LegalRuleDefinition,
    };
  }

  private engineRules(row: LegalRuleSetModel) {
    return {
      ...(row.rules as Record<string, unknown>), ruleSetId: row.ruleSetId, version: row.version,
      status: 'PUBLISHED', jurisdiction: row.jurisdiction, effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo, sourceReference: row.sourceReference,
    };
  }

  private scopeKey(companyId: number | null) { return companyId === null ? 'GLOBAL' : `COMPANY:${companyId}`; }
  private validDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  private mapUnique(error: unknown): never {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'SequelizeUniqueConstraintError')
      throw new ConflictError('A rule set with this scope, identifier and version already exists.');
    throw error;
  }
}
