import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

// ============================================================
// ai_usage_accounts
// ============================================================

export interface AiUsageAccountAttributes {
  id: string;
  companyId: number;
  period: string;
  quotaTokens: number | null;
  quotaMessages: number | null;
  quotaToolExecutions: number | null;
  reservedTokens: number;
  usedTokens: number;
  usedMessages: number;
  usedToolExecutions: number;
  alertThresholdPercent: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `ai_usage_accounts` — conta de consumo por tenant e período
 * (RF-AI-064/065/066, RN-AI-027).
 *
 * Uma conta por (empresa, período): as quotas são verificadas antes
 * de qualquer pedido dispendioso e o consumo confirmado nunca
 * diminui.
 */
export class AiUsageAccountModel
  extends Model<
    AiUsageAccountAttributes,
    Optional<
      AiUsageAccountAttributes,
      | 'quotaTokens'
      | 'quotaMessages'
      | 'quotaToolExecutions'
      | 'reservedTokens'
      | 'usedTokens'
      | 'usedMessages'
      | 'usedToolExecutions'
      | 'alertThresholdPercent'
      | 'updatedAt'
    >
  >
  implements AiUsageAccountAttributes
{
  declare id: string;
  declare companyId: number;
  declare period: string;
  declare quotaTokens: number | null;
  declare quotaMessages: number | null;
  declare quotaToolExecutions: number | null;
  declare reservedTokens: number;
  declare usedTokens: number;
  declare usedMessages: number;
  declare usedToolExecutions: number;
  declare alertThresholdPercent: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AiUsageAccountModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    period: { type: DataTypes.STRING(7), allowNull: false },
    quotaTokens: { type: DataTypes.DOUBLE, allowNull: true },
    quotaMessages: { type: DataTypes.INTEGER, allowNull: true },
    quotaToolExecutions: { type: DataTypes.INTEGER, allowNull: true },
    reservedTokens: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    usedTokens: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    usedMessages: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    usedToolExecutions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    alertThresholdPercent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 80 },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_usage_accounts',
    indexes: [
      { unique: true, fields: ['companyId', 'period'] },
      { fields: ['companyId', 'updatedAt'] },
    ],
  },
);

// ============================================================
// ai_usage_records
// ============================================================

export interface AiUsageRecordAttributes {
  id: string;
  companyId: number;
  interactionId: string;
  period: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  requests: number;
  toolExecutions: number;
  providerId: string;
  modelId: string;
  idempotencyKey: string;
  completedAt: Date;
  createdAt: Date;
}

/**
 * `ai_usage_records` — medição idempotente de consumo
 * (RF-AI-061/062, CA-AI-024).
 */
export class AiUsageRecordModel
  extends Model<
    AiUsageRecordAttributes,
    Optional<AiUsageRecordAttributes, 'cachedTokens' | 'createdAt'>
  >
  implements AiUsageRecordAttributes
{
  declare id: string;
  declare companyId: number;
  declare interactionId: string;
  declare period: string;
  declare inputTokens: number;
  declare outputTokens: number;
  declare cachedTokens: number;
  declare requests: number;
  declare toolExecutions: number;
  declare providerId: string;
  declare modelId: string;
  declare idempotencyKey: string;
  declare completedAt: Date;
  declare createdAt: Date;
}

AiUsageRecordModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    interactionId: { type: DataTypes.UUID, allowNull: false },
    period: { type: DataTypes.STRING(7), allowNull: false },
    inputTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    outputTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    cachedTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    requests: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    toolExecutions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    providerId: { type: DataTypes.STRING(60), allowNull: false },
    modelId: { type: DataTypes.STRING(80), allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(200), allowNull: false },
    completedAt: { type: DataTypes.DATE, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_usage_records',
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['idempotencyKey'] },
      { fields: ['companyId', 'period'] },
      { fields: ['companyId', 'providerId', 'modelId', 'period'] },
    ],
  },
);

// ============================================================
// ai_cost_records
// ============================================================

export interface AiCostRecordAttributes {
  id: string;
  companyId: number | null;
  usageRecordId: string | null;
  interactionId: string | null;
  providerId: string;
  modelId: string;
  period: string;
  amount: number;
  currency: string;
  estimated: boolean;
  createdAt: Date;
}

/**
 * `ai_cost_records` — custo de utilização por fornecedor/modelo
 * (RF-AI-063, RN-AI-011: `estimated` distingue projecção de
 * custo confirmado).
 */
export class AiCostRecordModel
  extends Model<
    AiCostRecordAttributes,
    Optional<
      AiCostRecordAttributes,
      'usageRecordId' | 'interactionId' | 'estimated' | 'createdAt'
    >
  >
  implements AiCostRecordAttributes
{
  declare id: string;
  declare companyId: number | null;
  declare usageRecordId: string | null;
  declare interactionId: string | null;
  declare providerId: string;
  declare modelId: string;
  declare period: string;
  declare amount: number;
  declare currency: string;
  declare estimated: boolean;
  declare createdAt: Date;
}

AiCostRecordModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: { type: DataTypes.INTEGER, allowNull: true },
    usageRecordId: { type: DataTypes.UUID, allowNull: true },
    interactionId: { type: DataTypes.UUID, allowNull: true },
    providerId: { type: DataTypes.STRING(60), allowNull: false },
    modelId: { type: DataTypes.STRING(80), allowNull: false },
    period: { type: DataTypes.STRING(7), allowNull: false },
    amount: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'AOA' },
    estimated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_cost_records',
    updatedAt: false,
    indexes: [
      { fields: ['companyId', 'period'] },
      { fields: ['companyId', 'providerId', 'period'] },
    ],
  },
);
