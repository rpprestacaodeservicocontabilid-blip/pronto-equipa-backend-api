import { AI_EVENTS } from '../../domain/events/ai-domain.event';
import { AiCostRecord } from '../../domain/entities/ai-cost-record.entity';
import { AiForbiddenError } from '../../domain/errors/ai-domain.error';
import type { AiUsageAccount } from '../../domain/aggregates/ai-usage-account.aggregate';
import type {
  AiUsageRecordInput,
  AiUsageRepository,
} from '../../domain/repositories/ai-usage.repository';
import type { AiCostSummaryView, AiUsageSummaryView } from '../dto/ai-admin.dto';
import type { AiEntitlementPort } from '../ports/ai-entitlement.port';
import type { AiNotificationPort } from '../ports/ai-notification.port';
import type { EventPublisherPort } from '../ports/event-publisher.port';

export interface AiUsageQuantities {
  tokens?: number;
  messages?: number;
  toolExecutions?: number;
}

export interface AiUsageReservation {
  entitlementReservationId: string | null;
  reservedTokens: number;
  period: string;
  commit(): Promise<void>;
  release(): Promise<void>;
}

const currentPeriod = (now = new Date()): string =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

const parseLimit = (value: string | null): number | null => {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

/**
 * Casos de uso de quotas, medição e custos (RF-AI-061 a RF-AI-070,
 * RN-AI-027/029).
 *
 * A verificação acontece ANTES de qualquer pedido dispendioso ao
 * modelo; a medição final é idempotente por chave (CA-AI-024).
 */
export class AiUsageService {
  constructor(
    private readonly usage: AiUsageRepository,
    private readonly entitlements: AiEntitlementPort,
    private readonly notifications: AiNotificationPort,
    private readonly events: EventPublisherPort,
  ) {}

  /** Garante que a subscrição permite o uso da IA (RF-AI-069). */
  async assertEnabled(tenantId: number): Promise<void> {
    const check = await this.entitlements.isAiEnabled(tenantId);
    if (!check.allowed)
      throw new AiForbiddenError(check.reason ?? 'A subscrição actual não inclui o assistente de IA.');
  }

  /** Lê a conta de consumo do período, criando-a se necessário. */
  async account(tenantId: number, period = currentPeriod()): Promise<AiUsageAccount> {
    const monthly = await this.entitlements.getMonthlyMessageLimit(tenantId);
    return this.usage.findOrCreateAccount(tenantId, period, {
      quotaMessages: parseLimit(monthly.limit),
    });
  }

  /** Persiste alterações locais à conta de consumo. */
  async save(account: AiUsageAccount): Promise<AiUsageAccount> {
    return this.usage.saveAccount(account);
  }

  /**
   * Reserva capacidade (tokens + mensagens) antes de processar um
   * pedido. Em caso de recusa, nada é reservado e o pedido é
   * rejeitado com `AI_QUOTA_EXCEEDED`.
   */
  async reserve(
    tenantId: number,
    quantities: AiUsageQuantities,
    operationKey: string,
    period = currentPeriod(),
  ): Promise<AiUsageReservation> {
    await this.assertEnabled(tenantId);

    const messages = quantities.messages ?? 0;
    let entitlementReservationId: string | null = null;
    if (messages > 0) {
      const entitlement = await this.entitlements.reserve(tenantId, messages, operationKey);
      if (!entitlement.allowed)
        throw new AiForbiddenError(
          entitlement.reason ?? 'Limite mensal de mensagens de IA atingido.',
        );
      entitlementReservationId = entitlement.reservationId;
    }

    const account = await this.account(tenantId, period);
    try {
      account.reserve(quantities);
    } catch (error) {
      if (entitlementReservationId)
        await this.entitlements.release(tenantId, entitlementReservationId);
      throw error;
    }
    await this.usage.saveAccount(account);

    const reservedTokens = quantities.tokens ?? 0;
    return {
      entitlementReservationId,
      reservedTokens,
      period,
      commit: async () => {
        if (entitlementReservationId)
          await this.entitlements.commit(tenantId, entitlementReservationId);
      },
      release: async () => {
        if (entitlementReservationId)
          await this.entitlements.release(tenantId, entitlementReservationId);
        const current = await this.account(tenantId, period);
        current.release(reservedTokens);
        await this.usage.saveAccount(current);
      },
    };
  }

  /**
   * Confirma o consumo efectivo e liberta a reserva (RN-AI-029).
   * A gravação é idempotente pela `idempotencyKey`.
   */
  async record(
    input: AiUsageRecordInput & { costAmount?: number; costCurrency?: string },
    period = currentPeriod(),
  ): Promise<{ created: boolean }> {
    const { costAmount, costCurrency, ...record } = input;
    const result = await this.usage.recordUsage({ ...record, period });
    if (!result.created) return { created: false };

    const account = await this.account(record.tenantId, period);
    account.recordUsage({
      tokens: record.inputTokens + record.outputTokens,
      messages: record.requests,
      toolExecutions: record.toolExecutions,
      reservedTokens: 0,
    });
    await this.usage.saveAccount(account);

    if (result.created && (costAmount ?? 0) > 0) {
      await this.usage.saveCostRecord(
        AiCostRecord.create({
          tenantId: record.tenantId,
          usageRecordId: result.record.id,
          interactionId: record.interactionId,
          providerId: record.providerId,
          modelId: record.modelId,
          period,
          amount: costAmount ?? 0,
          currency: costCurrency ?? 'AOA',
          estimated: true,
        }),
      );
    }

    await this.events.publish({
      eventName: AI_EVENTS.USAGE_RECORDED,
      aggregateId: result.record.id,
      tenantId: record.tenantId,
      userId: null,
      occurredAt: new Date(),
      payload: {
        period,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        requests: record.requests,
      },
    });

    if (result.created) await this.raiseThresholdAlerts(account);

    return { created: result.created };
  }

  /** Síntese de consumo do período (RF-AI-061). */
  async summary(tenantId: number, period = currentPeriod()): Promise<AiUsageSummaryView> {
    const totals = await this.usage.sumUsage({ tenantId, period });
    const account = await this.account(tenantId, period);

    return {
      period,
      tenantId,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      totalTokens: totals.inputTokens + totals.outputTokens,
      requests: totals.requests,
      toolExecutions: totals.toolExecutions,
      quotaTokens: account.quotaTokens,
      quotaMessages: account.quotaMessages,
      utilizationPercent: account.utilization('messages'),
      alertThresholdPercent: account.alertThresholdPercent,
    };
  }

  /** Síntese de custos do período (RF-AI-063). */
  async costs(tenantId: number, period = currentPeriod()): Promise<AiCostSummaryView> {
    const totals = await this.usage.sumCosts({ tenantId, period });
    const records = await this.usage.listCostRecords({ tenantId, period, limit: 1000 });

    const group = (key: 'providerId' | 'modelId') => {
      const buckets = new Map<string, { amount: number; currency: string }>();
      for (const record of records) {
        const bucket = buckets.get(record[key]) ?? { amount: 0, currency: record.currency };
        bucket.amount += record.amount;
        buckets.set(record[key], bucket);
      }
      return [...buckets.entries()].map(([id, value]) => ({
        [key === 'providerId' ? 'providerId' : 'modelId']: id,
        ...value,
      }));
    };

    return {
      period,
      amount: totals.amount,
      currency: totals.currency,
      estimatedAmount: totals.estimatedAmount,
      confirmedAmount: Math.max(0, totals.amount - totals.estimatedAmount),
      byProvider: group('providerId') as AiCostSummaryView['byProvider'],
      byModel: group('modelId') as AiCostSummaryView['byModel'],
    };
  }

  private async raiseThresholdAlerts(account: AiUsageAccount): Promise<void> {
    const metrics: Array<'tokens' | 'messages' | 'toolExecutions'> = [
      'tokens',
      'messages',
      'toolExecutions',
    ];
    const triggered = metrics.filter((metric) => account.shouldAlert(metric));
    if (!triggered.length) return;

    await this.notifications.notify({
      tenantId: account.tenantId,
      recipients: [],
      template: 'AI_USAGE_THRESHOLD',
      variables: {
        period: account.period,
        metrics: triggered,
        utilization: account.utilization(triggered[0]),
      },
      idempotencyKey: `ai-usage:${account.tenantId}:${account.period}:${triggered.join('-')}`,
    });
  }
}
