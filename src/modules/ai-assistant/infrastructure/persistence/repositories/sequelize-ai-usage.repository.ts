import { randomUUID } from 'crypto';
import { UniqueConstraintError } from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import { AiUsageAccount } from '../../../domain/aggregates/ai-usage-account.aggregate';
import { AiCostRecord } from '../../../domain/entities/ai-cost-record.entity';
import type {
  AiUsageRecord,
  AiUsageRecordInput,
  AiUsageRepository,
} from '../../../domain/repositories/ai-usage.repository';
import {
  AiCostRecordModel,
  AiUsageAccountModel,
  AiUsageRecordModel,
} from '../models/ai-usage.model';
import { aiQueryOptions } from '../ai-transaction-context';

const toAccount = (row: AiUsageAccountModel): AiUsageAccount =>
  AiUsageAccount.restore({
    id: row.id,
    tenantId: row.companyId,
    period: row.period,
    quotaTokens: row.quotaTokens,
    quotaMessages: row.quotaMessages,
    quotaToolExecutions: row.quotaToolExecutions,
    reservedTokens: Number(row.reservedTokens ?? 0),
    usedTokens: Number(row.usedTokens ?? 0),
    usedMessages: row.usedMessages,
    usedToolExecutions: row.usedToolExecutions,
    alertThresholdPercent: row.alertThresholdPercent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const toUsageRecord = (row: AiUsageRecordModel): AiUsageRecord => ({
  id: row.id,
  tenantId: row.companyId,
  interactionId: row.interactionId,
  period: row.period,
  inputTokens: row.inputTokens,
  outputTokens: row.outputTokens,
  cachedTokens: row.cachedTokens,
  requests: row.requests,
  toolExecutions: row.toolExecutions,
  providerId: row.providerId,
  modelId: row.modelId,
  idempotencyKey: row.idempotencyKey,
  completedAt: row.completedAt,
  createdAt: row.createdAt,
});

const toCostRecord = (row: AiCostRecordModel): AiCostRecord =>
  AiCostRecord.restore({
    id: row.id,
    tenantId: row.companyId,
    usageRecordId: row.usageRecordId,
    interactionId: row.interactionId,
    providerId: row.providerId,
    modelId: row.modelId,
    period: row.period,
    amount: Number(row.amount ?? 0),
    currency: row.currency,
    estimated: row.estimated,
    createdAt: row.createdAt,
  });

/**
 * Implementação Sequelize da medição de consumo e custos
 * (RF-AI-061 a RF-AI-070).
 *
 * A gravação é idempotente por chave: repetir a medição não duplica
 * consumo (CA-AI-024) — em caso de corrida devolve o registo já
 * existente.
 */
export class SequelizeAiUsageRepository implements AiUsageRepository {
  async findOrCreateAccount(
    tenantId: number,
    period: string,
    defaults?: Partial<{
      quotaTokens: number | null;
      quotaMessages: number | null;
      quotaToolExecutions: number | null;
      alertThresholdPercent: number;
    }>,
  ): Promise<AiUsageAccount> {
    const where = { companyId: tenantId, period };
    const existing = await AiUsageAccountModel.findOne({
      where,
      ...aiQueryOptions(),
    });
    if (existing) return toAccount(existing);

    const account = AiUsageAccount.create({
      tenantId,
      period,
      quotaTokens: defaults?.quotaTokens ?? null,
      quotaMessages: defaults?.quotaMessages ?? null,
      quotaToolExecutions: defaults?.quotaToolExecutions ?? null,
      alertThresholdPercent: defaults?.alertThresholdPercent,
    });

    try {
      await AiUsageAccountModel.create(
        {
          id: account.id,
          companyId: tenantId,
          period,
          quotaTokens: defaults?.quotaTokens ?? null,
          quotaMessages: defaults?.quotaMessages ?? null,
          quotaToolExecutions: defaults?.quotaToolExecutions ?? null,
          reservedTokens: account.reservedTokens,
          usedTokens: account.usedTokens,
          usedMessages: account.usedMessages,
          usedToolExecutions: account.usedToolExecutions,
          alertThresholdPercent: account.alertThresholdPercent,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        },
        aiQueryOptions(),
      );
      return account;
    } catch (error) {
      // Corrida concorrente: outra operação criou a conta primeiro.
      if (!(error instanceof UniqueConstraintError)) throw error;
      const row = await AiUsageAccountModel.findOne({ where, ...aiQueryOptions() });
      if (!row) throw error;
      return toAccount(row);
    }
  }

  async saveAccount(account: AiUsageAccount): Promise<AiUsageAccount> {
    const props = account.propsSnapshot;
    await AiUsageAccountModel.upsert(
      {
        id: props.id,
        companyId: props.tenantId,
        period: props.period,
        quotaTokens: props.quotaTokens,
        quotaMessages: props.quotaMessages,
        quotaToolExecutions: props.quotaToolExecutions,
        reservedTokens: props.reservedTokens,
        usedTokens: props.usedTokens,
        usedMessages: props.usedMessages,
        usedToolExecutions: props.usedToolExecutions,
        alertThresholdPercent: props.alertThresholdPercent,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      aiQueryOptions(),
    );
    return account;
  }

  async recordUsage(input: AiUsageRecordInput): Promise<{ record: AiUsageRecord; created: boolean }> {
    const existing = await AiUsageRecordModel.findOne({
      where: { idempotencyKey: input.idempotencyKey },
      ...aiQueryOptions(),
    });
    if (existing) return { record: toUsageRecord(existing), created: false };

    try {
      const row = await AiUsageRecordModel.create(
        {
          id: randomUUID(),
          companyId: input.tenantId,
          interactionId: input.interactionId,
          period: input.period,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          cachedTokens: input.cachedTokens,
          requests: input.requests,
          toolExecutions: input.toolExecutions,
          providerId: input.providerId,
          modelId: input.modelId,
          idempotencyKey: input.idempotencyKey,
          completedAt: input.completedAt,
        },
        aiQueryOptions(),
      );
      return { record: toUsageRecord(row), created: true };
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
      const row = await AiUsageRecordModel.findOne({
        where: { idempotencyKey: input.idempotencyKey },
        ...aiQueryOptions(),
      });
      if (!row) throw error;
      return { record: toUsageRecord(row), created: false };
    }
  }

  async findUsageRecordByIdempotencyKey(key: string): Promise<AiUsageRecord | null> {
    const row = await AiUsageRecordModel.findOne({
      where: { idempotencyKey: key },
      ...aiQueryOptions(),
    });
    return row ? toUsageRecord(row) : null;
  }

  async listUsageRecords(filter: {
    tenantId: number | null;
    period?: string;
    limit: number;
  }): Promise<AiUsageRecord[]> {
    const where: Record<string, unknown> = {};
    if (filter.tenantId !== null) where.companyId = filter.tenantId;
    if (filter.period) where.period = filter.period;

    const rows = await AiUsageRecordModel.findAll({
      where,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: Math.min(5000, Math.max(1, filter.limit)),
      ...aiQueryOptions(),
    });
    return rows.map(toUsageRecord);
  }

  async sumUsage(filter: { tenantId: number | null; period?: string }): Promise<{
    inputTokens: number;
    outputTokens: number;
    requests: number;
    toolExecutions: number;
  }> {
    const where: Record<string, unknown> = {};
    if (filter.tenantId !== null) where.companyId = filter.tenantId;
    if (filter.period) where.period = filter.period;

    const sum = async (column: 'inputTokens' | 'outputTokens' | 'requests' | 'toolExecutions') =>
      Number(
        (await AiUsageRecordModel.aggregate(column, 'SUM', {
          where,
          ...aiQueryOptions(),
        })) ?? 0,
      );

    return {
      inputTokens: Number((await sum('inputTokens')) || 0),
      outputTokens: Number((await sum('outputTokens')) || 0),
      requests: Number((await sum('requests')) || 0),
      toolExecutions: Number((await sum('toolExecutions')) || 0),
    };
  }

  async saveCostRecord(cost: AiCostRecord): Promise<AiCostRecord> {
    await AiCostRecordModel.upsert(
      {
        id: cost.id,
        companyId: cost.tenantId,
        usageRecordId: cost.usageRecordId,
        interactionId: cost.interactionId,
        providerId: cost.providerId,
        modelId: cost.modelId,
        period: cost.period,
        amount: cost.amount,
        currency: cost.currency,
        estimated: cost.estimated,
        createdAt: cost.createdAt,
      },
      aiQueryOptions(),
    );
    return cost;
  }

  async sumCosts(filter: { tenantId: number | null; period?: string }): Promise<{
    amount: number;
    currency: string;
    estimatedAmount: number;
  }> {
    const where: Record<string, unknown> = {};
    if (filter.tenantId !== null) where.companyId = filter.tenantId;
    if (filter.period) where.period = filter.period;

    const total = Number(
      (await AiCostRecordModel.aggregate('amount', 'SUM', {
        where,
        ...aiQueryOptions(),
      })) ?? 0,
    );

    const estimatedWhere = { ...where, estimated: true };
    const estimated = Number(
      (await AiCostRecordModel.aggregate('amount', 'SUM', {
        where: estimatedWhere,
        ...aiQueryOptions(),
      })) ?? 0,
    );

    // Agrupa por moeda e escolhe a moeda com o maior total.
    const grouped = (await AiCostRecordModel.findAll({
      attributes: ['currency', [sequelize.fn('SUM', sequelize.col('amount')), 'total']],
      group: ['currency'],
      raw: true,
      ...aiQueryOptions(),
    })) as unknown as Array<{ currency: string; total: string | number }>;

    const dominant = grouped.sort(
      (a, b) => Number(b.total ?? 0) - Number(a.total ?? 0),
    )[0];

    return {
      amount: Number(total || 0),
      currency: dominant?.currency ?? 'AOA',
      estimatedAmount: Number(estimated || 0),
    };
  }

  async listCostRecords(filter: {
    tenantId: number | null;
    period?: string;
    limit: number;
  }): Promise<AiCostRecord[]> {
    const where: Record<string, unknown> = {};
    if (filter.tenantId !== null) where.companyId = filter.tenantId;
    if (filter.period) where.period = filter.period;

    const rows = await AiCostRecordModel.findAll({
      where,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: Math.min(5000, Math.max(1, filter.limit)),
      ...aiQueryOptions(),
    });
    return rows.map(toCostRecord);
  }
}
