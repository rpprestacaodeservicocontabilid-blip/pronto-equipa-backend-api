import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { AiQuotaExceededError, AiValidationError } from '../errors/ai-domain.error';

export interface AiUsageAccountProps {
  id: string;
  tenantId: number;
  period: string;
  quotaTokens: number | null;
  quotaMessages: number | null;
  quotaToolExecutions: number | null;
  reservedTokens: number;
  usedTokens: number;
  usedMessages: number;
  usedToolExecutions: number;
  alertThresholdPercent: number;
  updatedAt: Date;
  createdAt: Date;
}

export interface AiUsageReserveInput {
  tokens?: number;
  messages?: number;
  toolExecutions?: number;
}

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Conta de consumo e quotas por tenant e período (secção 9.1,
 * RF-AI-064/065/066, RN-AI-027).
 *
 * Invariantes:
 *  - as quotas são verificadas ANTES de iniciar pedidos dispendiosos;
 *  - a reserva é idempotente por chave de operação;
 *  - o consumo confirmado nunca diminui;
 *  - ultrapassar o limite bloqueia o pedido com `AI_QUOTA_EXCEEDED`.
 */
export class AiUsageAccount extends AggregateRoot<AiUsageAccountProps> {
  private constructor(props: AiUsageAccountProps) {
    super(props);
  }

  static create(input: {
    tenantId: number;
    period: string;
    quotaTokens?: number | null;
    quotaMessages?: number | null;
    quotaToolExecutions?: number | null;
    alertThresholdPercent?: number;
    id?: string;
    now?: Date;
  }): AiUsageAccount {
    if (!Number.isSafeInteger(input.tenantId) || input.tenantId <= 0)
      throw new AiValidationError('Contexto de empresa inválido.');
    if (!PERIOD_PATTERN.test(String(input.period ?? '')))
      throw new AiValidationError('Período de consumo inválido (AAAA-MM).');

    const threshold = input.alertThresholdPercent ?? 80;
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 100)
      throw new AiValidationError('Limite de alerta inválido.');

    const now = input.now ?? new Date();
    return new AiUsageAccount({
      id: input.id ?? randomUUID(),
      tenantId: input.tenantId,
      period: input.period,
      quotaTokens: AiUsageAccount.normalizeQuota(input.quotaTokens),
      quotaMessages: AiUsageAccount.normalizeQuota(input.quotaMessages),
      quotaToolExecutions: AiUsageAccount.normalizeQuota(input.quotaToolExecutions),
      reservedTokens: 0,
      usedTokens: 0,
      usedMessages: 0,
      usedToolExecutions: 0,
      alertThresholdPercent: threshold,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: AiUsageAccountProps): AiUsageAccount {
    return new AiUsageAccount({ ...props });
  }

  private static normalizeQuota(value: number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (!Number.isSafeInteger(value) || value < 0)
      throw new AiValidationError('Quota inválida.');
    return value;
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): number {
    return this.props.tenantId;
  }

  get period(): string {
    return this.props.period;
  }

  get reservedTokens(): number {
    return this.props.reservedTokens;
  }

  get usedTokens(): number {
    return this.props.usedTokens;
  }

  get usedMessages(): number {
    return this.props.usedMessages;
  }

  get usedToolExecutions(): number {
    return this.props.usedToolExecutions;
  }

  get quotaTokens(): number | null {
    return this.props.quotaTokens;
  }

  get quotaMessages(): number | null {
    return this.props.quotaMessages;
  }

  get alertThresholdPercent(): number {
    return this.props.alertThresholdPercent;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /**
   * Verifica se a reserva é possível (RN-AI-027).
   * Não altera estado — a validação ocorre antes do pedido ao modelo.
   */
  assertAvailable(input: AiUsageReserveInput): void {
    const problems: string[] = [];
    if (
      input.tokens !== undefined &&
      this.props.quotaTokens !== null &&
      this.props.usedTokens + this.props.reservedTokens + input.tokens > this.props.quotaTokens
    )
      problems.push('tokens');
    if (
      input.messages !== undefined &&
      this.props.quotaMessages !== null &&
      this.props.usedMessages + input.messages > this.props.quotaMessages
    )
      problems.push('mensagens');
    if (
      input.toolExecutions !== undefined &&
      this.props.quotaToolExecutions !== null &&
      this.props.usedToolExecutions + input.toolExecutions > this.props.quotaToolExecutions
    )
      problems.push('execuções de ferramentas');
    if (problems.length)
      throw new AiQuotaExceededError(
        `Quota mensal de IA excedida para: ${problems.join(', ')}. Contacte o administrador da empresa.`,
      );
  }

  /** Reserva capacidade antes de um pedido dispendioso. */
  reserve(input: AiUsageReserveInput, now = new Date()): AiUsageAccountProps {
    this.assertAvailable(input);
    if (input.tokens) this.props.reservedTokens += input.tokens;
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  /** Confirma o consumo real e liberta a reserva associada. */
  recordUsage(
    input: AiUsageReserveInput & { reservedTokens?: number },
    now = new Date(),
  ): AiUsageAccountProps {
    if (input.tokens) this.props.usedTokens += input.tokens;
    if (input.messages) this.props.usedMessages += input.messages;
    if (input.toolExecutions) this.props.usedToolExecutions += input.toolExecutions;
    if (input.reservedTokens)
      this.props.reservedTokens = Math.max(0, this.props.reservedTokens - input.reservedTokens);
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  /** Libertar reserva não utilizada (estratégia 7 da secção 21.3). */
  release(tokens: number, now = new Date()): AiUsageAccountProps {
    if (!Number.isSafeInteger(tokens) || tokens < 0)
      throw new AiValidationError('Quantidade de reserva inválida.');
    this.props.reservedTokens = Math.max(0, this.props.reservedTokens - tokens);
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  setQuotas(
    quotas: {
      quotaTokens?: number | null;
      quotaMessages?: number | null;
      quotaToolExecutions?: number | null;
    },
    now = new Date(),
  ): AiUsageAccountProps {
    if (quotas.quotaTokens !== undefined)
      this.props.quotaTokens = AiUsageAccount.normalizeQuota(quotas.quotaTokens);
    if (quotas.quotaMessages !== undefined)
      this.props.quotaMessages = AiUsageAccount.normalizeQuota(quotas.quotaMessages);
    if (quotas.quotaToolExecutions !== undefined)
      this.props.quotaToolExecutions = AiUsageAccount.normalizeQuota(quotas.quotaToolExecutions);
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  /** Percentagem de utilização face ao limite (0–100, ou null sem quota). */
  utilization(metric: 'tokens' | 'messages' | 'toolExecutions'): number | null {
    const quota =
      metric === 'tokens'
        ? this.props.quotaTokens
        : metric === 'messages'
          ? this.props.quotaMessages
          : this.props.quotaToolExecutions;
    const used =
      metric === 'tokens'
        ? this.props.usedTokens + this.props.reservedTokens
        : metric === 'messages'
          ? this.props.usedMessages
          : this.props.usedToolExecutions;
    if (quota === null || quota === 0) return null;
    return Math.min(100, Math.round((used / quota) * 100));
  }

  shouldAlert(metric: 'tokens' | 'messages' | 'toolExecutions'): boolean {
    const usage = this.utilization(metric);
    return usage !== null && usage >= this.props.alertThresholdPercent;
  }

  public get propsSnapshot(): AiUsageAccountProps {
    return { ...this.props };
  }
}
