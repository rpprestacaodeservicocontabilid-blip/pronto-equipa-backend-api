import { RecordStoreContext } from '../../../../shared/application/ports/record-store.port';
import {
  AuditAccess,
  AuditEventInput,
  AuditHead,
  AuditObject,
  AuditObjectKind,
  AuditQuery,
  AuditReceipt,
  AuditRecordView,
  AuditScope,
  AuditSignature,
} from '../../domain/audit-contracts';
export interface AuditRepositoryPort {
  transaction<T>(
    scope: AuditScope,
    operation: (context: RecordStoreContext) => Promise<T>,
    context?: RecordStoreContext,
  ): Promise<T>;
  head(scope: AuditScope, context: RecordStoreContext): Promise<AuditHead>;
  byEvent(
    scope: AuditScope,
    sourceId: string,
    eventId: string,
    context: RecordStoreContext,
  ): Promise<AuditRecordView | null>;
  insert(record: AuditRecordView, context: RecordStoreContext): Promise<void>;
  advance(head: AuditHead, context: RecordStoreContext): Promise<void>;
  records(
    scope: AuditScope,
    query: AuditQuery,
    context: RecordStoreContext,
    access?: Pick<AuditAccess, 'actorId' | 'sensitive' | 'ownOnly'>,
  ): Promise<AuditRecordView[]>;
  record(
    scope: AuditScope,
    id: string,
    context: RecordStoreContext,
  ): Promise<AuditRecordView | null>;
  createObject(object: AuditObject, context: RecordStoreContext): Promise<AuditObject>;
  object(
    scope: AuditScope,
    kind: AuditObjectKind,
    id: string,
    context: RecordStoreContext,
  ): Promise<AuditObject | null>;
  objects(
    scope: AuditScope,
    kind: AuditObjectKind,
    context: RecordStoreContext,
  ): Promise<AuditObject[]>;
  updateObject(
    object: AuditObject,
    changes: { status?: string; data?: Record<string, unknown> },
    context: RecordStoreContext,
  ): Promise<AuditObject>;
  scopes(): Promise<AuditScope[]>;
}
export interface AuditCryptoPort {
  hash(value: string | Buffer): string;
  sign(value: string): AuditSignature;
  verify(value: string, signature: AuditSignature): boolean;
}
export interface AuditEvidenceStoragePort {
  put(scopeKey: string, id: string, bytes: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  anchor(scopeKey: string, id: string, bytes: Buffer): Promise<string>;
  anchors(scopeKey: string): Promise<Array<{ key: string; bytes: Buffer }>>;
}
export interface TransactionalAuditPort {
  append(input: AuditEventInput, context: RecordStoreContext): Promise<AuditReceipt>;
}
export interface AuditAppendPort {
  append(input: AuditEventInput, context?: RecordStoreContext): Promise<AuditReceipt>;
}
export interface AuditEventSourcePort {
  status?(scope: AuditScope): Promise<{ pending: number; oldestPendingAt: string | null }>;
  scan(
    scope: AuditScope,
    cursor: string | null,
    limit: number,
    reconcile?: boolean,
  ): Promise<{ events: Array<{ cursor: string; input: AuditEventInput }>; next: string | null }>;
  acknowledge?(scope: AuditScope, ids: string[]): Promise<void>;
}
export interface AuditNotificationPort {
  alert(scope: AuditScope, id: string, severity: string): Promise<void>;
}
export interface AuditClockPort {
  now(): Date;
  id(): string;
}
