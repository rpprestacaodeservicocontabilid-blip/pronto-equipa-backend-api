import { randomUUID } from 'crypto';
import { QueryTypes, Transaction, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../../../../infra/database';
import { BadRequestError, ConflictError, NotFoundError } from '../../../../shared/errors/app.error';
import type { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { AI_TOOL_CATALOG, AI_TOOL_CATALOG_VERSION } from '../../domain/ai-tool.catalog';
import { AiToolDefinition } from '../../domain/aggregates/ai-tool-definition.aggregate';
import { AiPromptVersion } from '../../domain/entities/ai-prompt-version.entity';
import type { AiModelConfigurationRecord, AiModelProviderRecord } from '../../domain/repositories/ai-admin.repository';
import { AiEvaluationModel, AiModelConfigurationModel, AiPromptVersionModel, AiSafetyIncidentModel, AiToolDefinitionModel } from '../../infrastructure/persistence/models/ai-models';
import { SequelizeAiAdminRepository } from '../../infrastructure/persistence/repositories/sequelize-ai-admin.repository';
import { SequelizeAiToolRepository } from '../../infrastructure/persistence/repositories/sequelize-ai-tool.repository';
import { aiQueryOptions, runWithAiTransaction } from '../../infrastructure/persistence/ai-transaction-context';
import { SequelizeAiUnitOfWork } from '../../infrastructure/persistence/repositories/sequelize-ai-work-unit';
import { toModelView, toPromptView } from './ai-views';

type ProviderInput = Pick<AiModelProviderRecord, 'code' | 'name' | 'status' | 'timeoutMs' | 'priority'>;
type ModelInput = Omit<AiModelConfigurationRecord, 'id' | 'createdAt' | 'updatedAt' | 'capabilities'>;

export class PlatformAiAdministration {
  private readonly admin = new SequelizeAiAdminRepository();
  private readonly tools = new SequelizeAiToolRepository();

  constructor(private readonly audit: AuditRecorderPort) {}

  async saveProvider(actor: number, input: ProviderInput, id?: string) {
    const saved = await this.change('models', async transaction => {
      const existing = id ? await this.admin.findModelProvider(id) : null;
      if (id && !existing) throw new NotFoundError('AI provider');
      if (existing && existing.code !== input.code) throw new BadRequestError('The provider code cannot be changed.');
      if (id && input.status === 'DISABLED' && await AiModelConfigurationModel.count({
        where: { providerId: id, isDefault: true, status: 'ACTIVE' }, transaction,
      })) throw new ConflictError('Select another default model before disabling this provider.');
      return this.admin.saveModelProvider({
        ...input, id: id ?? randomUUID(), baseUrl: existing?.baseUrl ?? null, apiKeyEnv: existing?.apiKeyEnv ?? null,
      });
    });
    await this.record(actor, 'provider.saved', saved.id, { code: saved.code, status: saved.status });
    return { id: saved.id, code: saved.code, status: saved.status };
  }

  async saveModel(actor: number, input: ModelInput, id?: string) {
    const saved = await this.change('models', async transaction => {
      const provider = await this.admin.findModelProvider(input.providerId);
      const existing = id ? await this.admin.findModelConfiguration(id) : null;
      if (!provider) throw new NotFoundError('AI provider');
      if (id && !existing) throw new NotFoundError('AI model');
      if (existing && (existing.providerId !== input.providerId || existing.modelCode !== input.modelCode))
        throw new BadRequestError('The provider and model code cannot be changed.');
      if (input.status !== 'DISABLED' && provider.status !== 'ACTIVE')
        throw new ConflictError('Enable the provider before configuring an active model.');
      if (input.isDefault && input.status !== 'ACTIVE') throw new BadRequestError('A default model must be active.');
      if (input.isDefault) await AiModelConfigurationModel.update({ isDefault: false }, { where: { isDefault: true }, transaction });
      return this.admin.saveModelConfiguration({ ...input, id: id ?? randomUUID(), capabilities: existing?.capabilities ?? [] });
    });
    await this.record(actor, 'model.saved', saved.id, { modelCode: saved.modelCode, status: saved.status, isDefault: saved.isDefault });
    return toModelView(saved);
  }

  async prompt(id: string) {
    const row = await AiPromptVersionModel.findByPk(id, { attributes: ['id', 'templateCode', 'version', 'status', 'content'] });
    if (!row) throw new NotFoundError('AI prompt');
    return row.get({ plain: true });
  }

  async createPrompt(actor: number, input: { templateCode: string; content: string }) {
    const version = await this.change('prompts', async transaction => {
      const latest = await AiPromptVersionModel.findOne({ attributes: ['version'], where: { templateCode: input.templateCode }, order: [['version', 'DESC']], transaction });
      return this.admin.savePromptVersion(AiPromptVersion.create({ ...input, version: (latest?.version ?? 0) + 1, createdBy: actor }));
    });
    await this.record(actor, 'prompt.created', version.id, { templateCode: version.templateCode, version: version.version });
    return toPromptView(version);
  }

  async publishPrompt(actor: number, id: string) {
    const result = await this.change('prompts', async transaction => {
      const row = await AiPromptVersionModel.findByPk(id, { transaction });
      if (!row) throw new NotFoundError('AI prompt');
      const { templateCode } = row;
      const latest = await AiPromptVersionModel.findOne({ where: { templateCode }, order: [['version', 'DESC']], transaction });
      if (latest?.id !== id) throw new ConflictError('A newer draft exists. Review it before publishing.');
      if (row.status === 'PUBLISHED') return { row, changed: false };
      if (!['DRAFT', 'TESTED'].includes(row.status)) throw new ConflictError('Only drafts or tested versions can be published.');
      await AiPromptVersionModel.update({ status: 'ARCHIVED' }, { where: { templateCode, status: 'PUBLISHED' }, transaction });
      return { row: await row.update({ status: 'PUBLISHED', publishedAt: new Date() }, { transaction }), changed: true };
    });
    if (result.changed) await this.record(actor, 'prompt.published', id, { templateCode: result.row.templateCode, version: result.row.version });
    return { id, status: result.row.status };
  }

  async syncTools(actor: number) {
    const count = await this.change('tools', async () => {
      let added = 0;
      for (const entry of AI_TOOL_CATALOG) {
        if (await this.tools.findToolDefinition(entry.name, AI_TOOL_CATALOG_VERSION)) continue;
        await this.tools.saveToolDefinition(AiToolDefinition.create({ ...entry, version: AI_TOOL_CATALOG_VERSION }));
        added++;
      }
      return added;
    });
    if (count) await this.record(actor, 'tools.synchronized', null, { count });
    return { count };
  }

  async disableTool(actor: number, id: string, reason: string) {
    const result = await this.change('tools', async transaction => {
      const row = await AiToolDefinitionModel.findByPk(id, { transaction });
      if (!row) throw new NotFoundError('AI tool');
      const definition = await this.tools.findToolDefinition(row.name, row.version);
      if (!definition) throw new NotFoundError('AI tool');
      const changed = definition.isActive;
      if (changed) {
        definition.disable(reason);
        await this.tools.saveToolDefinition(definition);
      }
      return { name: row.name, changed };
    });
    if (result.changed) await this.record(actor, 'tool.disabled', id, { name: result.name, reason });
    return { id, status: 'DISABLED' };
  }

  async createEvaluation(actor: number, input: { code: string; cases: Array<{ name: string; expectedBehaviour: string }> }) {
    const result = await this.change('evaluations', async transaction => {
      const latest = await AiEvaluationModel.findOne({ attributes: ['version'], where: { code: input.code }, order: [['version', 'DESC']], transaction });
      const now = new Date();
      return this.admin.saveEvaluation({
        id: randomUUID(), code: input.code, version: (latest?.version ?? 0) + 1, status: 'ACTIVE',
        cases: input.cases.map(item => ({ ...item, id: randomUUID() })),
        lastRunAt: null, lastScore: null, createdAt: now, updatedAt: now,
      });
    });
    await this.record(actor, 'evaluation.created', result.id, { code: result.code, version: result.version });
    return { id: result.id, code: result.code, version: result.version };
  }

  async updateIncident(actor: number, companyId: number, id: string, input: {
    expected: 'OPEN' | 'ACKNOWLEDGED'; status: 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED'; reason: string;
  }) {
    if (input.expected === input.status || (input.expected === 'OPEN' && input.status === 'RESOLVED'))
      throw new BadRequestError('Invalid incident status transition.');
    await new SequelizeAiUnitOfWork().run(companyId, async () => {
      const transaction = aiQueryOptions().transaction;
      const where = { id, companyId };
      const row = await AiSafetyIncidentModel.findOne({ attributes: ['id'], where, transaction });
      if (!row) throw new NotFoundError('AI safety incident');
      const [changed] = await AiSafetyIncidentModel.update(
        { status: input.status }, { where: { ...where, status: input.expected }, transaction },
      );
      if (!changed) throw new ConflictError('The incident status has changed. Refresh before updating.');
    });
    await this.record(actor, 'incident.updated', id, { companyId, from: input.expected, to: input.status, reason: input.reason });
    return { id, status: input.status };
  }

  private async change<T>(scope: string, operation: (transaction: Transaction) => Promise<T>): Promise<T> {
    try {
      return await sequelize.transaction(async transaction => {
        if (sequelize.getDialect() === 'postgres') {
          await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
            replacements: { key: 'platform.ai.' + scope }, type: QueryTypes.SELECT, transaction,
          });
        }
        return runWithAiTransaction({ tenantId: 0, transaction }, () => operation(transaction));
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw new ConflictError('This configuration already exists. Refresh the list.');
      throw error;
    }
  }

  private record(actorUserId: number, action: string, entityId: string | null, after: Record<string, unknown>) {
    return this.audit.record({ actorUserId, companyId: null, action: 'platform.ai.' + action, entityType: 'ai_assistant', entityId, after });
  }
}
