import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import {
  AuditHead,
  AuditScope,
  AuditObject,
  AuditObjectKind,
  AuditRecordView,
} from '../../../domain/audit-contracts';
export class AuditRecordModel extends Model<AuditRecordView> {}
export class AuditHeadModel extends Model<AuditHead> {}
export class AuditScopeCatalogModel extends Model<AuditScope> {}
export interface AuditCapture {
  processedAt: Date | null;
  id: string;
  companyId: number | null;
  sourceId: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  actorId: string | null;
  correlationId: string | null;
  occurredAt: Date;
  payload: Record<string, unknown>;
}
export class AuditCaptureModel extends Model<AuditCapture> {}
const str = (length = 200) => ({ type: DataTypes.STRING(length), allowNull: false });
const nullable = (length = 200) => ({ type: DataTypes.STRING(length), allowNull: true });
AuditRecordModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    scopeKey: str(),
    companyId: { type: DataTypes.INTEGER, allowNull: true },
    eventId: str(),
    sourceId: str(),
    sequence: { type: DataTypes.BIGINT, allowNull: false },
    schemaVersion: { type: DataTypes.INTEGER, allowNull: false },
    eventType: str(),
    module: str(80),
    action: str(),
    category: str(40),
    severity: str(20),
    outcome: str(20),
    actorId: nullable(),
    resourceType: str(),
    resourceId: str(),
    correlationId: nullable(),
    sensitivity: str(20),
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    receivedAt: { type: DataTypes.DATE, allowNull: false },
    policyVersion: { type: DataTypes.INTEGER, allowNull: false },
    inputHash: str(64),
    previousHash: str(64),
    payloadHash: str(64),
    recordHash: str(64),
    payload: { type: DataTypes.JSON, allowNull: false },
  },
  {
    sequelize,
    tableName: 'audit_records',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['scopeKey', 'sourceId', 'eventId'] },
      { unique: true, fields: ['scopeKey', 'sequence'] },
      { fields: ['companyId', 'occurredAt'] },
      { fields: ['scopeKey', 'actorId', 'sequence'] },
      { fields: ['scopeKey', 'resourceType', 'resourceId'] },
      { fields: ['scopeKey', 'correlationId'] },
      { fields: ['scopeKey', 'category', 'outcome'] },
      { fields: ['scopeKey', 'module', 'action', 'sequence'] },
    ],
  },
);
AuditHeadModel.init(
  {
    scopeKey: { ...str(), primaryKey: true },
    companyId: { type: DataTypes.INTEGER, allowNull: true },
    sequence: { type: DataTypes.BIGINT, allowNull: false },
    recordHash: str(64),
  },
  { sequelize, tableName: 'audit_chain_heads', timestamps: false },
);
AuditCaptureModel.init(
  {
    processedAt: { type: DataTypes.DATE, allowNull: true },
    id: { type: DataTypes.UUID, primaryKey: true },
    companyId: { type: DataTypes.INTEGER, allowNull: true },
    sourceId: str(),
    eventType: str(),
    resourceType: str(),
    resourceId: str(),
    actorId: nullable(),
    correlationId: nullable(),
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: false },
  },
  {
    sequelize,
    tableName: 'audit_capture_events',
    timestamps: false,
    indexes: [{ fields: ['companyId', 'occurredAt', 'id'] }],
  },
);
export const auditObjectTables: Record<AuditObjectKind, string> = {
  INVESTIGATION: 'audit_investigations',
  EVIDENCE: 'audit_evidence_packages',
  EXPORT: 'audit_export_requests',
  POLICY: 'audit_policies',
  RETENTION: 'audit_retention_policies',
  RETENTION_RUN: 'audit_retention_executions',
  LEGAL_HOLD: 'audit_legal_holds',
  ALERT_RULE: 'audit_alert_rules',
  ALERT: 'audit_alerts',
  CHECKPOINT: 'audit_integrity_checkpoints',
  INTEGRITY_RUN: 'audit_integrity_verifications',
  INGESTION_FAILURE: 'audit_ingestion_failures',
  RECONCILIATION: 'audit_reconciliation_runs',
  SOURCE_CURSOR: 'audit_source_cursors',
  OUTBOX: 'audit_outbox',
};
function objectModel(kind: AuditObjectKind) {
  class Row extends Model<AuditObject> {}
  Row.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true },
      scopeKey: str(),
      companyId: { type: DataTypes.INTEGER, allowNull: true },
      kind: str(40),
      key: str(240),
      status: str(40),
      data: { type: DataTypes.JSON, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: auditObjectTables[kind],
      timestamps: false,
      indexes: [
        { unique: true, fields: ['scopeKey', 'key'] },
        { fields: ['companyId', 'status', 'createdAt'] },
      ],
    },
  );
  return Row;
}
export const auditObjectModels = Object.fromEntries(
  Object.keys(auditObjectTables).map((kind) => [kind, objectModel(kind as AuditObjectKind)]),
) as Record<AuditObjectKind, ReturnType<typeof objectModel>>;
const immutable = () => {
  throw new Error('Audit records are append-only.');
};
AuditRecordModel.addHook('beforeUpdate', immutable);
AuditRecordModel.addHook('beforeBulkUpdate', immutable);
AuditRecordModel.addHook('beforeDestroy', immutable);
AuditRecordModel.addHook('beforeBulkDestroy', immutable);
AuditScopeCatalogModel.init(
  {
    scopeKey: { type: DataTypes.STRING(200), primaryKey: true },
    companyId: { type: DataTypes.INTEGER, allowNull: true },
  },
  { sequelize, tableName: 'audit_scope_catalog', timestamps: false },
);
export const AUDIT_ENGINE_MODELS = [
  AuditRecordModel,
  AuditHeadModel,
  AuditScopeCatalogModel,
  AuditCaptureModel,
  ...Object.values(auditObjectModels),
];
