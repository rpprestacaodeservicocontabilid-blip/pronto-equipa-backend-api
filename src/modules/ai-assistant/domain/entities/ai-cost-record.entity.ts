import { randomUUID } from 'crypto';
import { AiCost } from '../value-objects/ai-cost.vo';
import { AiValidationError } from '../errors/ai-domain.error';

export interface CreateAiCostRecordInput {
  tenantId: number | null;
  usageRecordId?: string | null;
  interactionId?: string | null;
  providerId: string;
  modelId: string;
  period: string;
  amount: number;
  currency?: string;
  estimated?: boolean;
  id?: string;
  now?: Date;
}

/**
 * Registo de custo de utilização de IA (RF-AI-063, secção 21.1).
 *
 * RN-AI-011: o campo `estimated` distingue custos projecionados dos
 * custos confirmados pelo fornecedor.
 */
export class AiCostRecord {
  readonly id: string;
  readonly tenantId: number | null;
  readonly usageRecordId: string | null;
  readonly interactionId: string | null;
  readonly providerId: string;
  readonly modelId: string;
  readonly period: string;
  readonly amount: number;
  readonly currency: string;
  readonly estimated: boolean;
  readonly createdAt: Date;

  private constructor(
    input: CreateAiCostRecordInput & { amount: number; currency: string; estimated: boolean; createdAt: Date },
  ) {
    this.id = input.id ?? randomUUID();
    this.tenantId = input.tenantId;
    this.usageRecordId = input.usageRecordId ?? null;
    this.interactionId = input.interactionId ?? null;
    this.providerId = input.providerId;
    this.modelId = input.modelId;
    this.period = input.period;
    this.amount = input.amount;
    this.currency = input.currency;
    this.estimated = input.estimated;
    this.createdAt = input.createdAt;
  }

  static create(input: CreateAiCostRecordInput): AiCostRecord {
    if (!input.providerId || !input.modelId)
      throw new AiValidationError('Fornecedor e modelo obrigatórios.');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(input.period ?? '')))
      throw new AiValidationError('Período de custo inválido (AAAA-MM).');

    const cost = AiCost.create(input.amount, input.currency ?? 'AOA', input.estimated ?? true);

    return new AiCostRecord({
      ...input,
      amount: cost.amount,
      currency: cost.currency,
      estimated: cost.estimated,
      createdAt: input.now ?? new Date(),
    });
  }

  static restore(
    props: CreateAiCostRecordInput & { amount: number; currency: string; estimated: boolean; createdAt?: Date },
  ): AiCostRecord {
    return new AiCostRecord({ ...props, createdAt: props.createdAt ?? new Date() });
  }
}
