import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

// ============================================================
// ai_knowledge_sources
// ============================================================

export interface AiKnowledgeSourceAttributes {
  id: string;
  scope: string;
  companyId: number | null;
  sourceType: string;
  referenceId: string | null;
  name: string;
  classification: string;
  sourceModule: string;
  status: string;
  accessPolicyVersion: string;
  documentCount: number;
  chunkCount: number;
  lastIndexedAt: Date | null;
  revokedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `ai_knowledge_sources` — fonte de conhecimento autorizada
 * (secção 13.2, RF-AI-021/022/023).
 *
 * `companyId: null` identifica fontes de âmbito `PLATFORM`.
 */
export class AiKnowledgeSourceModel
  extends Model<
    AiKnowledgeSourceAttributes,
    Optional<
      AiKnowledgeSourceAttributes,
      | 'referenceId'
      | 'lastIndexedAt'
      | 'revokedAt'
      | 'lastError'
      | 'documentCount'
      | 'chunkCount'
      | 'updatedAt'
    >
  >
  implements AiKnowledgeSourceAttributes
{
  declare id: string;
  declare scope: string;
  declare companyId: number | null;
  declare sourceType: string;
  declare referenceId: string | null;
  declare name: string;
  declare classification: string;
  declare sourceModule: string;
  declare status: string;
  declare accessPolicyVersion: string;
  declare documentCount: number;
  declare chunkCount: number;
  declare lastIndexedAt: Date | null;
  declare revokedAt: Date | null;
  declare lastError: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AiKnowledgeSourceModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    scope: { type: DataTypes.STRING(20), allowNull: false },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    sourceType: { type: DataTypes.STRING(60), allowNull: false },
    referenceId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    classification: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'INTERNAL' },
    sourceModule: { type: DataTypes.STRING(60), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
    accessPolicyVersion: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '1' },
    documentCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    chunkCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastIndexedAt: { type: DataTypes.DATE, allowNull: true },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.STRING(500), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_knowledge_sources',
    indexes: [
      { fields: ['companyId', 'status'] },
      { fields: ['scope', 'sourceModule'] },
    ],
  },
);

// ============================================================
// ai_knowledge_chunks
// ============================================================

export interface AiKnowledgeChunkAttributes {
  id: string;
  companyId: number | null;
  scope: string;
  documentId: string;
  documentVersionId: string;
  classification: string;
  sourceModule: string;
  content: string;
  sequence: number;
  accessPolicyVersion: string;
  sourceId: string;
  indexedAt: Date;
  status: string;
}

/**
 * `ai_knowledge_chunks` — segmento indexado com metadados de
 * isolamento (secção 13.4, RF-AI-024/026/029).
 *
 * O filtro de autorização é aplicado DENTRO da consulta (RN-AI-006).
 */
export class AiKnowledgeChunkModel
  extends Model<
    AiKnowledgeChunkAttributes,
    Optional<AiKnowledgeChunkAttributes, 'indexedAt' | 'status'>
  >
  implements AiKnowledgeChunkAttributes
{
  declare id: string;
  declare companyId: number | null;
  declare scope: string;
  declare documentId: string;
  declare documentVersionId: string;
  declare classification: string;
  declare sourceModule: string;
  declare content: string;
  declare sequence: number;
  declare accessPolicyVersion: string;
  declare sourceId: string;
  declare indexedAt: Date;
  declare status: string;
}

AiKnowledgeChunkModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: { type: DataTypes.INTEGER, allowNull: true },
    scope: { type: DataTypes.STRING(20), allowNull: false },
    documentId: { type: DataTypes.UUID, allowNull: false },
    documentVersionId: { type: DataTypes.STRING(80), allowNull: false },
    classification: { type: DataTypes.STRING(60), allowNull: false },
    sourceModule: { type: DataTypes.STRING(60), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    accessPolicyVersion: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '1' },
    sourceId: { type: DataTypes.UUID, allowNull: false },
    indexedAt: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
  },
  {
    sequelize,
    tableName: 'ai_knowledge_chunks',
    updatedAt: false,
    indexes: [
      { fields: ['companyId', 'sourceId', 'status'] },
      { fields: ['sourceId', 'documentId'] },
      { fields: ['companyId', 'classification', 'status'] },
    ],
  },
);

// ============================================================
// ai_indexing_jobs
// ============================================================

export interface AiIndexingJobAttributes {
  id: string;
  companyId: number | null;
  sourceId: string;
  kind: string;
  documentId: string | null;
  idempotencyKey: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `ai_indexing_jobs` — trabalho de indexação idempotente por chave
 * (RF-AI-024/025/026, CA-AI-026).
 */
export class AiIndexingJobModel
  extends Model<
    AiIndexingJobAttributes,
    Optional<
      AiIndexingJobAttributes,
      | 'documentId'
      | 'lastError'
      | 'nextAttemptAt'
      | 'attempts'
      | 'updatedAt'
    >
  >
  implements AiIndexingJobAttributes
{
  declare id: string;
  declare companyId: number | null;
  declare sourceId: string;
  declare kind: string;
  declare documentId: string | null;
  declare idempotencyKey: string;
  declare status: string;
  declare attempts: number;
  declare maxAttempts: number;
  declare lastError: string | null;
  declare nextAttemptAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AiIndexingJobModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: { type: DataTypes.INTEGER, allowNull: true },
    sourceId: { type: DataTypes.UUID, allowNull: false },
    kind: { type: DataTypes.STRING(20), allowNull: false },
    documentId: { type: DataTypes.UUID, allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(200), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING' },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    maxAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
    lastError: { type: DataTypes.STRING(500), allowNull: true },
    nextAttemptAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'ai_indexing_jobs',
    indexes: [
      { unique: true, fields: ['idempotencyKey'] },
      { fields: ['status', 'nextAttemptAt'] },
      { fields: ['companyId', 'sourceId', 'status'] },
    ],
  },
);
