import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

// ============================================================
// ai_tool_definitions
// ============================================================

export interface AiToolDefinitionAttributes {
  id: string;
  name: string;
  version: string;
  module: string;
  description: string;
  riskLevel: string;
  requiredPermissions: string[];
  requiresConfirmation: boolean;
  requiresApproval: boolean;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  status: string;
  disabledReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `ai_tool_definitions` — catálogo registado das ferramentas
 * (secção 11, RF-AI-041/042/044).
 *
 * Sem `companyId`: o catálogo é de âmbito `PLATFORM` e não pode ser
 * alterado pelo modelo (RN-AI-016/017).
 */
export class AiToolDefinitionModel
  extends Model<
    AiToolDefinitionAttributes,
    Optional<
      AiToolDefinitionAttributes,
      'disabledReason' | 'updatedAt'
    >
  >
  implements AiToolDefinitionAttributes
{
  declare id: string;
  declare name: string;
  declare version: string;
  declare module: string;
  declare description: string;
  declare riskLevel: string;
  declare requiredPermissions: string[];
  declare requiresConfirmation: boolean;
  declare requiresApproval: boolean;
  declare inputSchema: Record<string, unknown>;
  declare outputSchema: Record<string, unknown>;
  declare status: string;
  declare disabledReason: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AiToolDefinitionModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    version: { type: DataTypes.STRING(20), allowNull: false },
    module: { type: DataTypes.STRING(60), allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: false },
    riskLevel: { type: DataTypes.STRING(20), allowNull: false },
    requiredPermissions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    requiresConfirmation: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    requiresApproval: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    inputSchema: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    outputSchema: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
    disabledReason: { type: DataTypes.STRING(300), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_tool_definitions',
    indexes: [
      { unique: true, fields: ['name', 'version'] },
      { fields: ['module', 'status'] },
    ],
  },
);

// ============================================================
// ai_tool_executions
// ============================================================

export interface AiToolExecutionAttributes {
  id: string;
  companyId: number;
  interactionId: string | null;
  toolName: string;
  toolVersion: string;
  status: string;
  argumentsHash: string;
  idempotencyKey: string;
  resultReference: string | null;
  failureReason: string | null;
  executedBy: number;
  startedAt: Date;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `ai_tool_executions` — execução concreta de uma ferramenta
 * (RF-AI-045/049): resultado, rasto e idempotência por chave.
 */
export class AiToolExecutionModel
  extends Model<
    AiToolExecutionAttributes,
    Optional<
      AiToolExecutionAttributes,
      'resultReference' | 'failureReason' | 'finishedAt' | 'updatedAt'
    >
  >
  implements AiToolExecutionAttributes
{
  declare id: string;
  declare companyId: number;
  declare interactionId: string | null;
  declare toolName: string;
  declare toolVersion: string;
  declare status: string;
  declare argumentsHash: string;
  declare idempotencyKey: string;
  declare resultReference: string | null;
  declare failureReason: string | null;
  declare executedBy: number;
  declare startedAt: Date;
  declare finishedAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AiToolExecutionModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    interactionId: { type: DataTypes.UUID, allowNull: true },
    toolName: { type: DataTypes.STRING(80), allowNull: false },
    toolVersion: { type: DataTypes.STRING(20), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false },
    argumentsHash: { type: DataTypes.STRING(64), allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(200), allowNull: false },
    resultReference: { type: DataTypes.STRING(240), allowNull: true },
    failureReason: { type: DataTypes.STRING(500), allowNull: true },
    executedBy: { type: DataTypes.INTEGER, allowNull: false },
    startedAt: { type: DataTypes.DATE, allowNull: false },
    finishedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_tool_executions',
    indexes: [
      { unique: true, fields: ['companyId', 'idempotencyKey'] },
      { fields: ['companyId', 'toolName', 'status', 'createdAt'] },
      { fields: ['companyId', 'interactionId'] },
    ],
  },
);

// ============================================================
// ai_action_approvals
// ============================================================

export interface AiActionApprovalAttributes {
  id: string;
  companyId: number;
  interactionId: string;
  conversationId: string;
  proposedBy: number;
  toolName: string;
  toolVersion: string;
  argumentsJson: Record<string, unknown>;
  actionHash: string;
  riskLevel: string;
  requiresConfirmation: boolean;
  requiresApproval: boolean;
  status: string;
  confirmedBy: number | null;
  confirmedAt: Date | null;
  approvedBy: number | null;
  approvedAt: Date | null;
  rejectedBy: number | null;
  rejectedAt: Date | null;
  decisionReason: string | null;
  expiresAt: Date;
  executedAt: Date | null;
  executionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `ai_action_approvals` — proposta de acção e aprovação humana
 * (secção 20.2, RF-AI-046/047/048).
 *
 * Os argumentos são imutáveis após a proposta: a aprovação fica
 * vinculada ao `actionHash` (CA-AI-016).
 */
export class AiActionApprovalModel
  extends Model<
    AiActionApprovalAttributes,
    Optional<
      AiActionApprovalAttributes,
      | 'confirmedBy'
      | 'confirmedAt'
      | 'approvedBy'
      | 'approvedAt'
      | 'rejectedBy'
      | 'rejectedAt'
      | 'decisionReason'
      | 'executedAt'
      | 'executionId'
      | 'updatedAt'
    >
  >
  implements AiActionApprovalAttributes
{
  declare id: string;
  declare companyId: number;
  declare interactionId: string;
  declare conversationId: string;
  declare proposedBy: number;
  declare toolName: string;
  declare toolVersion: string;
  declare argumentsJson: Record<string, unknown>;
  declare actionHash: string;
  declare riskLevel: string;
  declare requiresConfirmation: boolean;
  declare requiresApproval: boolean;
  declare status: string;
  declare confirmedBy: number | null;
  declare confirmedAt: Date | null;
  declare approvedBy: number | null;
  declare approvedAt: Date | null;
  declare rejectedBy: number | null;
  declare rejectedAt: Date | null;
  declare decisionReason: string | null;
  declare expiresAt: Date;
  declare executedAt: Date | null;
  declare executionId: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AiActionApprovalModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    interactionId: { type: DataTypes.UUID, allowNull: false },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    proposedBy: { type: DataTypes.INTEGER, allowNull: false },
    toolName: { type: DataTypes.STRING(80), allowNull: false },
    toolVersion: { type: DataTypes.STRING(20), allowNull: false },
    argumentsJson: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    actionHash: { type: DataTypes.STRING(64), allowNull: false },
    riskLevel: { type: DataTypes.STRING(20), allowNull: false },
    requiresConfirmation: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    requiresApproval: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: { type: DataTypes.STRING(30), allowNull: false },
    confirmedBy: { type: DataTypes.INTEGER, allowNull: true },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    approvedBy: { type: DataTypes.INTEGER, allowNull: true },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    rejectedBy: { type: DataTypes.INTEGER, allowNull: true },
    rejectedAt: { type: DataTypes.DATE, allowNull: true },
    decisionReason: { type: DataTypes.STRING(500), allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    executedAt: { type: DataTypes.DATE, allowNull: true },
    executionId: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_action_approvals',
    indexes: [
      { fields: ['companyId', 'status', 'expiresAt'] },
      { fields: ['companyId', 'proposedBy', 'status'] },
      { fields: ['companyId', 'interactionId'] },
    ],
  },
);
