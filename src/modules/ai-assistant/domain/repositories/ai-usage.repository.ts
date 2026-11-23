import { AiUsageAccount } from '../aggregates/ai-usage-account.aggregate';
import { AiCostRecord } from '../entities/ai-cost-record.entity';

export interface AiUsageRecordInput {
  tenantId: number;
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
}

export interface AiUsageRecord extends AiUsageRecordInput {
  id: string;
  createdAt: Date;
}

/**
 * Contrato de medição de consumo e custos (RF-AI-061 a RF-AI-070,
 * RN-AI-029).
 *
 * A gravação é idempotente por chave: repetir a medição não duplica
 * consumo (CA-AI-024).
 */
export interface AiUsageRepository {
  findOrCreateAccount(
    tenantId: number,
    period: string,
    defaults?: Partial<{
      quotaTokens: number | null;
      quotaMessages: number | null;
      quotaToolExecutions: number | null;
      alertThresholdPercent: number;
    }>,
  ): Promise<AiUsageAccount>;
  saveAccount(account: AiUsageAccount): Promise<AiUsageAccount>;

  recordUsage(input: AiUsageRecordInput): Promise<{ record: AiUsageRecord; created: boolean }>;
  findUsageRecordByIdempotencyKey(key: string): Promise<AiUsageRecord | null>;
  listUsageRecords(filter: {
    tenantId: number | null;
    period?: string;
    limit: number;
  }): Promise<AiUsageRecord[]>;
  sumUsage(filter: { tenantId: number | null; period?: string }): Promise<{
    inputTokens: number;
    outputTokens: number;
    requests: number;
    toolExecutions: number;
  }>;

  saveCostRecord(cost: AiCostRecord): Promise<AiCostRecord>;
  sumCosts(filter: { tenantId: number | null; period?: string }): Promise<{
    amount: number;
    currency: string;
    estimatedAmount: number;
  }>;
  listCostRecords(filter: {
    tenantId: number | null;
    period?: string;
    limit: number;
  }): Promise<AiCostRecord[]>;
}
