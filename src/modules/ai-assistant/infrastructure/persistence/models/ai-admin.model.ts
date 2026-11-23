import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

// ============================================================
// ai_prompt_versions
// ============================================================

export interface AiPromptVersionAttributes {
  id: string;
  templateCode: string;
  version: number;
  content: string;
  modelHints: string[];
  status: string;
  createdBy: number | null;
  publishedAt: Date | null;
  createdAt: Date;
}

/**
 * `ai_prompt_versions` — versões imutáveis de prompts
 * (RF-AI-054/055/056). Apenas uma versão publicada por template.
 */
export class AiPromptVersionModel
  extends Model<
    AiPromptVersionAttributes,
    Optional<
      AiPromptVersionAttributes,
      'modelHints' | 'createdBy' | 'publishedAt' | 'createdAt'
    >
  >
  implements AiPromptVersionAttributes
{
  declare id: string;
  declare templateCode: string;
  declare version: number;
  declare content: string;
  declare modelHints: string[];
  declare status: string;
  declare createdBy: number | null;
  declare publishedAt: Date | null;
  declare createdAt: Date;
}

AiPromptVersionModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    templateCode: { type: DataTypes.STRING(60), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    modelHints: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'DRAFT' },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_prompt_versions',
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['templateCode', 'version'] },
      { fields: ['templateCode', 'status'] },
    ],
  },
);

// ============================================================
// ai_safety_incidents
// ============================================================

export interface AiSafetyIncidentAttributes {
  id: string;
  companyId: number | null;
  interactionId: string | null;
  category: string;
  severity: string;
  summary: string;
  details: Record<string, unknown>;
  detectedBy: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `ai_safety_incidents` — incidente de segurança detetado
 * (RF-AI-076, RN-AI-023/024).
 */
export class AiSafetyIncidentModel
  extends Model<
    AiSafetyIncidentAttributes,
    Optional<
      AiSafetyIncidentAttributes,
      'interactionId' | 'details' | 'status' | 'updatedAt'
    >
  >
  implements AiSafetyIncidentAttributes
{
  declare id: string;
  declare companyId: number | null;
  declare interactionId: string | null;
  declare category: string;
  declare severity: string;
  declare summary: string;
  declare details: Record<string, unknown>;
  declare detectedBy: string;
  declare status: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AiSafetyIncidentModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: { type: DataTypes.INTEGER, allowNull: true },
    interactionId: { type: DataTypes.UUID, allowNull: true },
    category: { type: DataTypes.STRING(60), allowNull: false },
    severity: { type: DataTypes.STRING(20), allowNull: false },
    summary: { type: DataTypes.STRING(500), allowNull: false },
    details: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    detectedBy: { type: DataTypes.STRING(60), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'OPEN' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_safety_incidents',
    indexes: [
      { fields: ['companyId', 'status', 'severity', 'createdAt'] },
      { fields: ['companyId', 'category', 'createdAt'] },
    ],
  },
);

// ============================================================
// ai_safety_policies
// ============================================================

export interface AiSafetyPolicyAttributes {
  id: string;
  scopeKey: string;
  version: number;
  status: string;
  configuration: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `ai_safety_policies` — política de segurança versionada
 * (RF-AI-070/071, RN-AI-022).
 */
export class AiSafetyPolicyModel
  extends Model<
    AiSafetyPolicyAttributes,
    Optional<AiSafetyPolicyAttributes, 'updatedAt'>
  >
  implements AiSafetyPolicyAttributes
{
  declare id: string;
  declare scopeKey: string;
  declare version: number;
  declare status: string;
  declare configuration: Record<string, unknown>;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AiSafetyPolicyModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    scopeKey: { type: DataTypes.STRING(80), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
    configuration: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_safety_policies',
    indexes: [
      { unique: true, fields: ['scopeKey', 'version'] },
      { fields: ['scopeKey', 'status'] },
    ],
  },
);

// ============================================================
// ai_model_providers
// ============================================================

export interface AiModelProviderAttributes {
  id: string;
  code: string;
  name: string;
  status: string;
  baseUrl: string | null;
  apiKeyEnv: string | null;
  timeoutMs: number;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `ai_model_providers` — fornecedores de IA configurados
 * (RF-AI-051/052). A chave da API é referenciada por variável de
 * ambiente, nunca guardada (RN-AI-021).
 */
export class AiModelProviderModel
  extends Model<
    AiModelProviderAttributes,
    Optional<
      AiModelProviderAttributes,
      'baseUrl' | 'apiKeyEnv' | 'timeoutMs' | 'priority' | 'updatedAt'
    >
  >
  implements AiModelProviderAttributes
{
  declare id: string;
  declare code: string;
  declare name: string;
  declare status: string;
  declare baseUrl: string | null;
  declare apiKeyEnv: string | null;
  declare timeoutMs: number;
  declare priority: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AiModelProviderModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    code: { type: DataTypes.STRING(40), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
    baseUrl: { type: DataTypes.STRING(300), allowNull: true },
    apiKeyEnv: { type: DataTypes.STRING(80), allowNull: true },
    timeoutMs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60000 },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_model_providers',
    indexes: [{ unique: true, fields: ['code'] }, { fields: ['status', 'priority'] }],
  },
);

// ============================================================
// ai_model_configurations
// ============================================================

export interface AiModelConfigurationAttributes {
  id: string;
  providerId: string;
  modelCode: string;
  displayName: string;
  status: string;
  isDefault: boolean;
  temperature: number | null;
  maxOutputTokens: number | null;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  currency: string;
  capabilities: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `ai_model_configurations` — modelos activos e preços de referência
 * (RF-AI-053/057, RF-AI-063).
 */
export class AiModelConfigurationModel
  extends Model<
    AiModelConfigurationAttributes,
    Optional<
      AiModelConfigurationAttributes,
      | 'temperature'
      | 'maxOutputTokens'
      | 'capabilities'
      | 'updatedAt'
    >
  >
  implements AiModelConfigurationAttributes
{
  declare id: string;
  declare providerId: string;
  declare modelCode: string;
  declare displayName: string;
  declare status: string;
  declare isDefault: boolean;
  declare temperature: number | null;
  declare maxOutputTokens: number | null;
  declare inputPricePerMillion: number;
  declare outputPricePerMillion: number;
  declare currency: string;
  declare capabilities: string[];
  declare createdAt: Date;
  declare updatedAt: Date;
}

AiModelConfigurationModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    providerId: { type: DataTypes.UUID, allowNull: false },
    modelCode: { type: DataTypes.STRING(80), allowNull: false },
    displayName: { type: DataTypes.STRING(120), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    temperature: { type: DataTypes.FLOAT, allowNull: true },
    maxOutputTokens: { type: DataTypes.INTEGER, allowNull: true },
    inputPricePerMillion: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    outputPricePerMillion: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'AOA' },
    capabilities: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_model_configurations',
    indexes: [
      { unique: true, fields: ['providerId', 'modelCode'] },
      { fields: ['status', 'isDefault'] },
    ],
  },
);

// ============================================================
// ai_evaluations
// ============================================================

export interface AiEvaluationAttributes {
  id: string;
  code: string;
  version: number;
  status: string;
  cases: Array<{ id: string; name: string; expectedBehaviour: string }>;
  lastRunAt: Date | null;
  lastScore: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `ai_evaluations` — conjunto de casos de avaliação de qualidade
 * (RF-AI-077/078).
 */
export class AiEvaluationModel
  extends Model<
    AiEvaluationAttributes,
    Optional<
      AiEvaluationAttributes,
      'cases' | 'lastRunAt' | 'lastScore' | 'updatedAt'
    >
  >
  implements AiEvaluationAttributes
{
  declare id: string;
  declare code: string;
  declare version: number;
  declare status: string;
  declare cases: Array<{ id: string; name: string; expectedBehaviour: string }>;
  declare lastRunAt: Date | null;
  declare lastScore: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AiEvaluationModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    code: { type: DataTypes.STRING(60), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
    cases: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    lastRunAt: { type: DataTypes.DATE, allowNull: true },
    lastScore: { type: DataTypes.FLOAT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_evaluations',
    indexes: [
      { unique: true, fields: ['code', 'version'] },
      { fields: ['status', 'lastRunAt'] },
    ],
  },
);
