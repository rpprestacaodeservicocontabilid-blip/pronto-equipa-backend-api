import { AiPromptVersion } from '../../../domain/entities/ai-prompt-version.entity';
import { AiSafetyIncident } from '../../../domain/entities/ai-safety-incident.entity';
import type {
  AiAdminRepository,
  AiEvaluationRecord,
  AiModelConfigurationRecord,
  AiModelProviderRecord,
  AiSafetyPolicyRecord,
} from '../../../domain/repositories/ai-admin.repository';
import {
  AiEvaluationModel,
  AiModelConfigurationModel,
  AiModelProviderModel,
  AiPromptVersionModel,
  AiSafetyIncidentModel,
  AiSafetyPolicyModel,
} from '../models/ai-admin.model';
import { aiQueryOptions } from '../ai-transaction-context';

const toProvider = (row: AiModelProviderModel): AiModelProviderRecord => ({
  id: row.id,
  code: row.code,
  name: row.name,
  status: row.status as AiModelProviderRecord['status'],
  baseUrl: row.baseUrl,
  apiKeyEnv: row.apiKeyEnv,
  timeoutMs: row.timeoutMs,
  priority: row.priority,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toConfiguration = (row: AiModelConfigurationModel): AiModelConfigurationRecord => ({
  id: row.id,
  providerId: row.providerId,
  modelCode: row.modelCode,
  displayName: row.displayName,
  status: row.status as AiModelConfigurationRecord['status'],
  isDefault: row.isDefault,
  temperature: row.temperature,
  maxOutputTokens: row.maxOutputTokens,
  inputPricePerMillion: Number(row.inputPricePerMillion ?? 0),
  outputPricePerMillion: Number(row.outputPricePerMillion ?? 0),
  currency: row.currency,
  capabilities: row.capabilities ?? [],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toPolicy = (row: AiSafetyPolicyModel): AiSafetyPolicyRecord => ({
  id: row.id,
  scopeKey: row.scopeKey,
  version: row.version,
  status: row.status as AiSafetyPolicyRecord['status'],
  configuration: row.configuration ?? {},
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toEvaluation = (row: AiEvaluationModel): AiEvaluationRecord => ({
  id: row.id,
  code: row.code,
  version: row.version,
  status: row.status as AiEvaluationRecord['status'],
  cases: row.cases ?? [],
  lastRunAt: row.lastRunAt,
  lastScore: row.lastScore,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toPromptVersion = (row: AiPromptVersionModel): AiPromptVersion =>
  AiPromptVersion.restore({
    id: row.id,
    templateCode: row.templateCode,
    version: row.version,
    content: row.content,
    modelHints: row.modelHints ?? [],
    status: row.status as AiPromptVersion['status'],
    createdBy: row.createdBy,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
  });

const toIncident = (row: AiSafetyIncidentModel): AiSafetyIncident =>
  AiSafetyIncident.restore({
    id: row.id,
    tenantId: row.companyId,
    interactionId: row.interactionId,
    category: row.category as AiSafetyIncident['category'],
    severity: row.severity as AiSafetyIncident['severity'],
    summary: row.summary,
    details: row.details ?? {},
    detectedBy: row.detectedBy,
    status: row.status as AiSafetyIncident['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

/**
 * Implementação Sequelize da administração do assistente
 * (RF-AI-051 a RF-AI-059, RF-AI-074 a RF-AI-080).
 *
 * Fornecedores, modelos, prompts, políticas e avaliações são de
 * âmbito de plataforma — não existe isolamento por tenant nestas
 * tabelas.
 */
export class SequelizeAiAdminRepository implements AiAdminRepository {
  // ------------------------------------------------------------
  // Fornecedores e modelos
  // ------------------------------------------------------------

  async listModelProviders(): Promise<AiModelProviderRecord[]> {
    const rows = await AiModelProviderModel.findAll({
      order: [
        ['priority', 'ASC'],
        ['name', 'ASC'],
      ],
      ...aiQueryOptions(),
    });
    return rows.map(toProvider);
  }

  async saveModelProvider(
    provider: Omit<AiModelProviderRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<AiModelProviderRecord> {
    await AiModelProviderModel.upsert(
      {
        id: provider.id,
        code: provider.code,
        name: provider.name,
        status: provider.status,
        baseUrl: provider.baseUrl,
        apiKeyEnv: provider.apiKeyEnv,
        timeoutMs: provider.timeoutMs,
        priority: provider.priority,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      aiQueryOptions(),
    );
    const row = await AiModelProviderModel.findOne({
      where: { id: provider.id },
      ...aiQueryOptions(),
    });
    if (!row) throw new Error('Falha ao registar o fornecedor de IA.');
    return toProvider(row);
  }

  async findModelProvider(id: string): Promise<AiModelProviderRecord | null> {
    const row = await AiModelProviderModel.findOne({ where: { id }, ...aiQueryOptions() });
    return row ? toProvider(row) : null;
  }

  async listModelConfigurations(filter?: {
    providerId?: string;
    status?: string;
  }): Promise<AiModelConfigurationRecord[]> {
    const where: Record<string, unknown> = {};
    if (filter?.providerId) where.providerId = filter.providerId;
    if (filter?.status) where.status = filter.status;

    const rows = await AiModelConfigurationModel.findAll({
      where,
      order: [
        ['isDefault', 'DESC'],
        ['displayName', 'ASC'],
      ],
      ...aiQueryOptions(),
    });
    return rows.map(toConfiguration);
  }

  async findModelConfiguration(id: string): Promise<AiModelConfigurationRecord | null> {
    const row = await AiModelConfigurationModel.findOne({ where: { id }, ...aiQueryOptions() });
    return row ? toConfiguration(row) : null;
  }

  async saveModelConfiguration(
    configuration: Omit<AiModelConfigurationRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<AiModelConfigurationRecord> {
    await AiModelConfigurationModel.upsert(
      {
        id: configuration.id,
        providerId: configuration.providerId,
        modelCode: configuration.modelCode,
        displayName: configuration.displayName,
        status: configuration.status,
        isDefault: configuration.isDefault,
        temperature: configuration.temperature,
        maxOutputTokens: configuration.maxOutputTokens,
        inputPricePerMillion: configuration.inputPricePerMillion,
        outputPricePerMillion: configuration.outputPricePerMillion,
        currency: configuration.currency,
        capabilities: configuration.capabilities,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      aiQueryOptions(),
    );
    const row = await AiModelConfigurationModel.findOne({
      where: { id: configuration.id },
      ...aiQueryOptions(),
    });
    if (!row) throw new Error('Falha ao registar a configuração de modelo.');
    return toConfiguration(row);
  }

  async clearDefaultModel(providerId: string): Promise<void> {
    await AiModelConfigurationModel.update(
      { isDefault: false, updatedAt: new Date() },
      { where: { providerId, isDefault: true }, ...aiQueryOptions() },
    );
  }

  // ------------------------------------------------------------
  // Prompts
  // ------------------------------------------------------------

  async listPromptVersions(filter: {
    templateCode?: string;
    status?: string;
    limit: number;
  }): Promise<AiPromptVersion[]> {
    const where: Record<string, unknown> = {};
    if (filter.templateCode) where.templateCode = filter.templateCode;
    if (filter.status) where.status = filter.status;

    const rows = await AiPromptVersionModel.findAll({
      where,
      order: [
        ['templateCode', 'ASC'],
        ['version', 'DESC'],
      ],
      limit: Math.min(200, Math.max(1, filter.limit)),
      ...aiQueryOptions(),
    });
    return rows.map(toPromptVersion);
  }

  async savePromptVersion(version: AiPromptVersion): Promise<AiPromptVersion> {
    await AiPromptVersionModel.upsert(
      {
        id: version.id,
        templateCode: version.templateCode,
        version: version.version,
        content: version.content,
        modelHints: [...version.modelHints],
        status: version.status,
        createdBy: version.createdBy,
        publishedAt: version.publishedAt,
        createdAt: version.createdAt,
      },
      aiQueryOptions(),
    );
    return version;
  }

  async findPublishedPrompt(templateCode: string): Promise<AiPromptVersion | null> {
    const row = await AiPromptVersionModel.findOne({
      where: { templateCode, status: 'PUBLISHED' },
      order: [['version', 'DESC']],
      ...aiQueryOptions(),
    });
    return row ? toPromptVersion(row) : null;
  }

  // ------------------------------------------------------------
  // Política de segurança
  // ------------------------------------------------------------

  async saveSafetyPolicy(policy: AiSafetyPolicyRecord): Promise<AiSafetyPolicyRecord> {
    await AiSafetyPolicyModel.upsert(
      {
        id: policy.id,
        scopeKey: policy.scopeKey,
        version: policy.version,
        status: policy.status,
        configuration: policy.configuration,
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt,
      },
      aiQueryOptions(),
    );
    const row = await AiSafetyPolicyModel.findOne({
      where: { id: policy.id },
      ...aiQueryOptions(),
    });
    if (!row) throw new Error('Falha ao registar a política de segurança.');
    return toPolicy(row);
  }

  async findActiveSafetyPolicy(scopeKey: string): Promise<AiSafetyPolicyRecord | null> {
    const row = await AiSafetyPolicyModel.findOne({
      where: { scopeKey, status: 'ACTIVE' },
      order: [['version', 'DESC']],
      ...aiQueryOptions(),
    });
    return row ? toPolicy(row) : null;
  }

  // ------------------------------------------------------------
  // Incidentes de segurança
  // ------------------------------------------------------------

  async saveSafetyIncident(incident: AiSafetyIncident): Promise<AiSafetyIncident> {
    await AiSafetyIncidentModel.upsert(
      {
        id: incident.id,
        companyId: incident.tenantId,
        interactionId: incident.interactionId,
        category: incident.category,
        severity: incident.severity,
        summary: incident.summary,
        details: incident.details,
        detectedBy: incident.detectedBy,
        status: incident.status,
        createdAt: incident.createdAt,
        updatedAt: incident.updatedAt,
      },
      aiQueryOptions(),
    );
    return incident;
  }

  async listSafetyIncidents(filter: {
    tenantId: number | null;
    status?: string;
    severity?: string;
    limit: number;
  }): Promise<AiSafetyIncident[]> {
    const where: Record<string, unknown> = {};
    if (filter.tenantId !== null) where.companyId = filter.tenantId;
    if (filter.status) where.status = filter.status;
    if (filter.severity) where.severity = filter.severity;

    const rows = await AiSafetyIncidentModel.findAll({
      where,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: Math.min(500, Math.max(1, filter.limit)),
      ...aiQueryOptions(),
    });
    return rows.map(toIncident);
  }

  async countSafetyIncidents(filter: { tenantId: number | null }): Promise<number> {
    const where: Record<string, unknown> = {};
    if (filter.tenantId !== null) where.companyId = filter.tenantId;
    return AiSafetyIncidentModel.count({ where, ...aiQueryOptions() });
  }

  // ------------------------------------------------------------
  // Avaliações
  // ------------------------------------------------------------

  async saveEvaluation(evaluation: AiEvaluationRecord): Promise<AiEvaluationRecord> {
    await AiEvaluationModel.upsert(
      {
        id: evaluation.id,
        code: evaluation.code,
        version: evaluation.version,
        status: evaluation.status,
        cases: evaluation.cases,
        lastRunAt: evaluation.lastRunAt,
        lastScore: evaluation.lastScore,
        createdAt: evaluation.createdAt,
        updatedAt: evaluation.updatedAt,
      },
      aiQueryOptions(),
    );
    const row = await AiEvaluationModel.findOne({
      where: { id: evaluation.id },
      ...aiQueryOptions(),
    });
    if (!row) throw new Error('Falha ao registar a avaliação.');
    return toEvaluation(row);
  }

  async listEvaluations(limit: number): Promise<AiEvaluationRecord[]> {
    const rows = await AiEvaluationModel.findAll({
      order: [
        ['code', 'ASC'],
        ['version', 'DESC'],
      ],
      limit: Math.min(200, Math.max(1, limit)),
      ...aiQueryOptions(),
    });
    return rows.map(toEvaluation);
  }
}
