import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

// ============================================================
// ai_interactions
// ============================================================

export interface AiInteractionAttributes {
  id: string;
  companyId: number;
  conversationId: string;
  userId: number;
  status: string;
  idempotencyKey: string;
  prompt: string;
  safetyClassification: string;
  safetyReasons: string[];
  providerId: string | null;
  modelId: string | null;
  promptCode: string | null;
  promptVersion: number | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostAmount: number;
  estimatedCostCurrency: string;
  toolCallCount: number;
  citationCount: number;
  failureReason: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `ai_interactions` — ciclo de vida de um pedido ao assistente
 * (secção 10, RF-AI-003/008/009).
 *
 * A chave de idempotência é única por tenant e conversa (CA-AI-018).
 */
export class AiInteractionModel
  extends Model<
    AiInteractionAttributes,
    Optional<
      AiInteractionAttributes,
      | 'providerId'
      | 'modelId'
      | 'promptCode'
      | 'promptVersion'
      | 'failureReason'
      | 'completedAt'
      | 'updatedAt'
    >
  >
  implements AiInteractionAttributes
{
  declare id: string;
  declare companyId: number;
  declare conversationId: string;
  declare userId: number;
  declare status: string;
  declare idempotencyKey: string;
  declare prompt: string;
  declare safetyClassification: string;
  declare safetyReasons: string[];
  declare providerId: string | null;
  declare modelId: string | null;
  declare promptCode: string | null;
  declare promptVersion: number | null;
  declare inputTokens: number;
  declare outputTokens: number;
  declare estimatedCostAmount: number;
  declare estimatedCostCurrency: string;
  declare toolCallCount: number;
  declare citationCount: number;
  declare failureReason: string | null;
  declare startedAt: Date;
  declare completedAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AiInteractionModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(160), allowNull: false },
    prompt: { type: DataTypes.TEXT, allowNull: false },
    safetyClassification: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'SAFE' },
    safetyReasons: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    providerId: { type: DataTypes.STRING(60), allowNull: true },
    modelId: { type: DataTypes.STRING(80), allowNull: true },
    promptCode: { type: DataTypes.STRING(60), allowNull: true },
    promptVersion: { type: DataTypes.INTEGER, allowNull: true },
    inputTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    outputTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    estimatedCostAmount: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },
    estimatedCostCurrency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'AOA',
    },
    toolCallCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    citationCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failureReason: { type: DataTypes.STRING(500), allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: false },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_interactions',
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'conversationId', 'idempotencyKey'],
        name: 'uq_ai_interactions_idempotency',
      },
      { fields: ['companyId', 'status', 'createdAt'] },
      { fields: ['companyId', 'userId', 'createdAt'] },
      { fields: ['companyId', 'conversationId', 'createdAt'] },
    ],
  },
);

// ============================================================
// ai_model_invocations
// ============================================================

export interface AiModelInvocationAttributes {
  id: string;
  companyId: number;
  interactionId: string;
  providerId: string;
  modelId: string;
  promptCode: string | null;
  promptVersion: number | null;
  status: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostAmount: number;
  estimatedCostCurrency: string;
  latencyMs: number;
  fallbackUsed: boolean;
  errorCode: string | null;
  createdAt: Date;
}

/**
 * `ai_model_invocations` — chamada concreta a um fornecedor
 * (RF-AI-051/052/060, RN-AI-013): regista a versão efectivamente
 * utilizada, o consumo medido e a latência.
 */
export class AiModelInvocationModel
  extends Model<
    AiModelInvocationAttributes,
    Optional<
      AiModelInvocationAttributes,
      | 'promptCode'
      | 'promptVersion'
      | 'inputTokens'
      | 'outputTokens'
      | 'estimatedCostAmount'
      | 'estimatedCostCurrency'
      | 'latencyMs'
      | 'fallbackUsed'
      | 'errorCode'
      | 'createdAt'
    >
  >
  implements AiModelInvocationAttributes
{
  declare id: string;
  declare companyId: number;
  declare interactionId: string;
  declare providerId: string;
  declare modelId: string;
  declare promptCode: string | null;
  declare promptVersion: number | null;
  declare status: string;
  declare inputTokens: number;
  declare outputTokens: number;
  declare estimatedCostAmount: number;
  declare estimatedCostCurrency: string;
  declare latencyMs: number;
  declare fallbackUsed: boolean;
  declare errorCode: string | null;
  declare createdAt: Date;
}

AiModelInvocationModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    interactionId: { type: DataTypes.UUID, allowNull: false },
    providerId: { type: DataTypes.STRING(60), allowNull: false },
    modelId: { type: DataTypes.STRING(80), allowNull: false },
    promptCode: { type: DataTypes.STRING(60), allowNull: true },
    promptVersion: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING' },
    inputTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    outputTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    estimatedCostAmount: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },
    estimatedCostCurrency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'AOA',
    },
    latencyMs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    fallbackUsed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    errorCode: { type: DataTypes.STRING(80), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_model_invocations',
    updatedAt: false,
    indexes: [
      { fields: ['companyId', 'interactionId'] },
      { fields: ['companyId', 'providerId', 'modelId', 'createdAt'] },
    ],
  },
);

// ============================================================
// ai_feedback
// ============================================================

export interface AiFeedbackAttributes {
  id: string;
  companyId: number;
  interactionId: string;
  userId: number;
  rating: number;
  comment: string | null;
  category: string | null;
  createdAt: Date;
}

/**
 * `ai_feedback` — avaliação de uma resposta (RF-AI-010/075).
 *
 * Uma única avaliação por utilizador e interacção (índice único).
 */
export class AiFeedbackModel
  extends Model<
    AiFeedbackAttributes,
    Optional<AiFeedbackAttributes, 'comment' | 'category' | 'createdAt'>
  >
  implements AiFeedbackAttributes
{
  declare id: string;
  declare companyId: number;
  declare interactionId: string;
  declare userId: number;
  declare rating: number;
  declare comment: string | null;
  declare category: string | null;
  declare createdAt: Date;
}

AiFeedbackModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    interactionId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    rating: { type: DataTypes.INTEGER, allowNull: false },
    comment: { type: DataTypes.STRING(1000), allowNull: true },
    category: { type: DataTypes.STRING(60), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_feedback',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'interactionId', 'userId'],
        name: 'uq_ai_feedback_interaction_user',
      },
    ],
  },
);
