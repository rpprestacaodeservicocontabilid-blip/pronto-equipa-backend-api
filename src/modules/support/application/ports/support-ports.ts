import {
  RecordStorePort,
  StoredRecord,
} from '../../../../shared/application/ports/record-store.port';

export interface SupportRecord extends StoredRecord {
  scopeKey: string;
  userId: number | null;
  data: Record<string, unknown>;
}

export type SupportStorePort = RecordStorePort<SupportRecord>;

export interface SupportEntitlementPort {
  getSupportEntitlements(input: { tenantId: string; at: Date }): Promise<{
    supportEnabled: boolean;
    supportTier: string;
    allowedChannels: string[];
    slaPolicyCode: string;
  }>;
}

export interface SupportNotificationPort {
  notifyTicketCreated(input: {
    tenantId: string;
    ticketId: string;
    recipientUserIds: string[];
    idempotencyKey: string;
  }): Promise<void>;
  notifyTicketUpdated(input: {
    tenantId: string;
    ticketId: string;
    recipientUserIds: string[];
    idempotencyKey: string;
  }): Promise<void>;
}

export interface SupportDocumentPort {
  assertAvailable(input: { tenantId: string; documentId: string }): Promise<void>;
}
