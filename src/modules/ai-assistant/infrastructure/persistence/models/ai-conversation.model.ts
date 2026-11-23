import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

// ============================================================
// ai_conversations
// ============================================================

export interface AiConversationAttributes {
  id: string;
  companyId: number;
  userId: number;
  title: string;
  status: string;
  messageCount: number;
  lastMessageAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `ai_conversations` — conversas do assistente (RF-AI-001/004).
 *
 * O isolamento é duplo: `companyId` (tenant) e `userId` (dono).
 */
export class AiConversationModel
  extends Model<
    AiConversationAttributes,
    Optional<
      AiConversationAttributes,
      'messageCount' | 'lastMessageAt' | 'archivedAt' | 'deletedAt' | 'updatedAt'
    >
  >
  implements AiConversationAttributes
{
  declare id: string;
  declare companyId: number;
  declare userId: number;
  declare title: string;
  declare status: string;
  declare messageCount: number;
  declare lastMessageAt: Date | null;
  declare archivedAt: Date | null;
  declare deletedAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AiConversationModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(160), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false },
    messageCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastMessageAt: { type: DataTypes.DATE, allowNull: true },
    archivedAt: { type: DataTypes.DATE, allowNull: true },
    deletedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_conversations',
    indexes: [
      { fields: ['companyId', 'userId', 'status', 'createdAt'] },
      { fields: ['companyId', 'userId', 'lastMessageAt'] },
    ],
  },
);

// ============================================================
// ai_messages
// ============================================================

export interface AiMessageAttributes {
  id: string;
  companyId: number;
  conversationId: string;
  interactionId: string | null;
  role: string;
  content: string;
  safetyClassification: string;
  contentReference: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
}

/**
 * `ai_messages` — mensagens de uma conversa (RF-AI-002/003).
 *
 * `idempotencyKey` torna a gravação idempotente por pedido
 * (CA-AI-018): repetir o envio não duplica mensagens.
 */
export class AiMessageModel
  extends Model<
    AiMessageAttributes,
    Optional<
      AiMessageAttributes,
      'interactionId' | 'contentReference' | 'idempotencyKey' | 'createdAt'
    >
  >
  implements AiMessageAttributes
{
  declare id: string;
  declare companyId: number;
  declare conversationId: string;
  declare interactionId: string | null;
  declare role: string;
  declare content: string;
  declare safetyClassification: string;
  declare contentReference: string | null;
  declare idempotencyKey: string | null;
  declare createdAt: Date;
}

AiMessageModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    interactionId: { type: DataTypes.UUID, allowNull: true },
    role: { type: DataTypes.STRING(20), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    safetyClassification: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'SAFE' },
    contentReference: { type: DataTypes.STRING(240), allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(160), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_messages',
    updatedAt: false,
    indexes: [
      { fields: ['companyId', 'conversationId', 'createdAt'] },
      {
        unique: true,
        fields: ['companyId', 'conversationId', 'idempotencyKey'],
        name: 'uq_ai_messages_idempotency',
      },
    ],
  },
);

// ============================================================
// ai_message_citations
// ============================================================

export interface AiMessageCitationAttributes {
  id: string;
  companyId: number;
  messageId: string;
  sourceId: string;
  title: string;
  reference: string;
  chunkId: string | null;
  score: number;
  createdAt: Date;
}

/**
 * `ai_message_citations` — evidência apresentada com a resposta
 * (RF-AI-027, RN-AI-014/015).
 */
export class AiMessageCitationModel
  extends Model<
    AiMessageCitationAttributes,
    Optional<AiMessageCitationAttributes, 'chunkId' | 'score' | 'createdAt'>
  >
  implements AiMessageCitationAttributes
{
  declare id: string;
  declare companyId: number;
  declare messageId: string;
  declare sourceId: string;
  declare title: string;
  declare reference: string;
  declare chunkId: string | null;
  declare score: number;
  declare createdAt: Date;
}

AiMessageCitationModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    messageId: { type: DataTypes.UUID, allowNull: false },
    sourceId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(300), allowNull: false },
    reference: { type: DataTypes.STRING(500), allowNull: false },
    chunkId: { type: DataTypes.UUID, allowNull: true },
    score: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_message_citations',
    updatedAt: false,
    indexes: [{ fields: ['companyId', 'messageId'] }],
  },
);

// ============================================================
// ai_context_snapshots
// ============================================================

export interface AiContextSnapshotAttributes {
  id: string;
  companyId: number;
  interactionId: string;
  contextHash: string;
  policyVersion: string;
  permissions: string[];
  knowledgeSourceIds: string[];
  redactedFields: string[];
  toolNames: string[];
  createdAt: Date;
}

/**
 * `ai_context_snapshots` — prova do contexto autorizado aplicado
 * antes de o conteúdo chegar ao modelo (RF-AI-014/015).
 */
export class AiContextSnapshotModel
  extends Model<
    AiContextSnapshotAttributes,
    Optional<AiContextSnapshotAttributes, 'createdAt'>
  >
  implements AiContextSnapshotAttributes
{
  declare id: string;
  declare companyId: number;
  declare interactionId: string;
  declare contextHash: string;
  declare policyVersion: string;
  declare permissions: string[];
  declare knowledgeSourceIds: string[];
  declare redactedFields: string[];
  declare toolNames: string[];
  declare createdAt: Date;
}

AiContextSnapshotModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    interactionId: { type: DataTypes.UUID, allowNull: false },
    contextHash: { type: DataTypes.STRING(64), allowNull: false },
    policyVersion: { type: DataTypes.STRING(40), allowNull: false },
    permissions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    knowledgeSourceIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    redactedFields: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    toolNames: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_context_snapshots',
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['companyId', 'interactionId'] },
      { fields: ['companyId', 'contextHash'] },
    ],
  },
);
