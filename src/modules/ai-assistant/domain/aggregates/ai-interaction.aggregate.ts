import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { AiDomainEvent, AI_EVENTS } from '../events/ai-domain.event';
import {
  AiInvalidTransitionError,
  AiValidationError,
} from '../errors/ai-domain.error';
import { AiIdempotencyKey } from '../value-objects/ai-idempotency-key.vo';
import { AiInteractionStatus } from '../value-objects/ai-interaction-status.vo';
import { AiSafetyClassification } from '../value-objects/ai-safety-classification.vo';
import { AiTokenUsage } from '../value-objects/ai-token-usage.vo';

export interface AiInteractionProps {
  id: string;
  tenantId: number;
  conversationId: string;
  userId: number;
  status: string;
  idempotencyKey: string;
  prompt: string;
  safetyClassification: string;
  safetyReasons: string[];
  providerId: string | null;
  modelId: string | null;
  promptCode: string | null;
  promptVersion: number | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostAmount: number;
  estimatedCostCurrency: string;
  toolCallCount: number;
  citationCount: number;
  failureReason: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAiInteractionInput {
  tenantId: number;
  conversationId: string;
  userId: number;
  prompt: string;
  idempotencyKey: string;
  id?: string;
  now?: Date;
}

/**
 * Ciclo de vida de um pedido ao assistente (secção 9.1, secção 10).
 *
 * Invariantes:
 *  - toda a interacção pertence a uma conversa válida e a um tenant;
 *  - as transições seguem a máquina de estados da secção 10.1;
 *  - uma interacção terminal não sofre mais alterações;
 *  - o consumo medido nunca é reduzido (RN-AI-029).
 */
export class AiInteraction extends AggregateRoot<AiInteractionProps> {
  private constructor(props: AiInteractionProps) {
    super(props);
  }

  static create(input: CreateAiInteractionInput): AiInteraction {
    if (!Number.isSafeInteger(input.tenantId) || input.tenantId <= 0)
      throw new AiValidationError('Contexto de empresa inválido.');
    if (!Number.isSafeInteger(input.userId) || input.userId <= 0)
      throw new AiValidationError('Utilizador autenticado obrigatório.');
    if (!input.conversationId) throw new AiValidationError('Conversa obrigatória.');

    const prompt = String(input.prompt ?? '').trim();
    if (!prompt) throw new AiValidationError('A mensagem não pode estar vazia.');
    if (prompt.length > 32000) throw new AiValidationError('A mensagem excede o limite permitido.');

    const key = AiIdempotencyKey.create(input.idempotencyKey);
    const now = input.now ?? new Date();
    const id = input.id ?? randomUUID();

    const interaction = new AiInteraction({
      id,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      userId: input.userId,
      status: 'RECEIVED',
      idempotencyKey: key.value,
      prompt,
      safetyClassification: 'SAFE',
      safetyReasons: [],
      providerId: null,
      modelId: null,
      promptCode: null,
      promptVersion: null,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostAmount: 0,
      estimatedCostCurrency: 'AOA',
      toolCallCount: 0,
      citationCount: 0,
      failureReason: null,
      startedAt: now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    interaction.record(
      new AiDomainEvent({
        eventName: AI_EVENTS.INTERACTION_STARTED,
        aggregateId: id,
        companyId: input.tenantId,
        userId: input.userId,
        payload: { interactionId: id, conversationId: input.conversationId },
        occurredAt: now,
      }),
    );

    return interaction;
  }

  static restore(props: AiInteractionProps): AiInteraction {
    return new AiInteraction({ ...props, safetyReasons: [...(props.safetyReasons ?? [])] });
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): number {
    return this.props.tenantId;
  }

  get conversationId(): string {
    return this.props.conversationId;
  }

  get userId(): number {
    return this.props.userId;
  }

  get status(): string {
    return this.props.status;
  }

  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }

  get prompt(): string {
    return this.props.prompt;
  }

  get providerId(): string | null {
    return this.props.providerId;
  }

  get modelId(): string | null {
    return this.props.modelId;
  }

  get inputTokens(): number {
    return this.props.inputTokens;
  }

  get outputTokens(): number {
    return this.props.outputTokens;
  }

  get estimatedCostAmount(): number {
    return this.props.estimatedCostAmount;
  }

  get estimatedCostCurrency(): string {
    return this.props.estimatedCostCurrency;
  }

  get toolCallCount(): number {
    return this.props.toolCallCount;
  }

  get promptCode(): string | null {
    return this.props.promptCode;
  }

  get promptVersion(): number | null {
    return this.props.promptVersion;
  }

  get safetyClassification(): string {
    return this.props.safetyClassification;
  }

  get safetyReasons(): readonly string[] {
    return [...this.props.safetyReasons];
  }

  get citationCount(): number {
    return this.props.citationCount;
  }

  get failureReason(): string | null {
    return this.props.failureReason;
  }

  get startedAt(): Date {
    return this.props.startedAt;
  }

  get completedAt(): Date | null {
    return this.props.completedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get isTerminal(): boolean {
    return AiInteractionStatus.from(this.props.status).isTerminal;
  }

  get isAwaitingHuman(): boolean {
    return AiInteractionStatus.from(this.props.status).isAwaitingHuman;
  }

  /** Transição validada pela máquina de estados (secção 10.1). */
  transition(to: string, now = new Date()): AiInteractionProps {
    const current = AiInteractionStatus.from(this.props.status);
    const next = AiInteractionStatus.from(to);
    if (!current.canTransitionTo(next)) throw new AiInvalidTransitionError(current.value, next.value);
    this.props.status = next.value;
    this.props.updatedAt = now;
    if (next.isTerminal) this.props.completedAt = now;
    return this.propsSnapshot;
  }

  /** Percurso principal: RECEIVED → VALIDATING → AUTHORIZING → ... */
  advancePipeline(now = new Date()): AiInteractionProps {
    const order = [
      'RECEIVED',
      'VALIDATING',
      'AUTHORIZING',
      'BUILDING_CONTEXT',
      'RETRIEVING',
      'GENERATING',
    ];
    const index = order.indexOf(this.props.status);
    if (index < 0) return this.propsSnapshot;
    for (let i = index; i < order.length - 1; i += 1) this.transition(order[i + 1], now);
    return this.propsSnapshot;
  }

  recordSafety(classification: AiSafetyClassification, now = new Date()): AiInteractionProps {
    this.props.safetyClassification = classification.value;
    this.props.safetyReasons = [...classification.reasons];
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  recordModel(providerId: string, modelId: string, now = new Date()): AiInteractionProps {
    this.props.providerId = providerId;
    this.props.modelId = modelId;
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  recordPromptVersion(code: string, version: number, now = new Date()): AiInteractionProps {
    this.props.promptCode = code;
    this.props.promptVersion = version;
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  /**
   * Regista consumo medido (RN-AI-029).
   *
   * Repetições do mesmo valor são idempotentes; valores inferiores ao
   * acumulado são ignorados — o consumo confirmado nunca diminui.
   */
  recordUsage(usage: AiTokenUsage, costAmount = 0, now = new Date()): AiInteractionProps {
    this.props.inputTokens = Math.max(this.props.inputTokens, usage.inputTokens);
    this.props.outputTokens = Math.max(this.props.outputTokens, usage.outputTokens);
    if (Number.isFinite(costAmount) && costAmount > 0)
      this.props.estimatedCostAmount = Math.max(this.props.estimatedCostAmount, costAmount);
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  recordToolCall(now = new Date()): AiInteractionProps {
    this.props.toolCallCount += 1;
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  recordCitation(count: number, now = new Date()): AiInteractionProps {
    if (!Number.isSafeInteger(count) || count < 0)
      throw new AiValidationError('Contagem de citações inválida.');
    this.props.citationCount = count;
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  fail(reason: string, now = new Date()): AiInteractionProps {
    this.props.failureReason = String(reason ?? '').slice(0, 500);
    this.transition('FAILED', now);
    this.record(
      new AiDomainEvent({
        eventName: AI_EVENTS.INTERACTION_FAILED,
        aggregateId: this.props.id,
        companyId: this.props.tenantId,
        userId: this.props.userId,
        payload: { interactionId: this.props.id, reason: this.props.failureReason },
        occurredAt: now,
      }),
    );
    return this.propsSnapshot;
  }

  block(reason: string, now = new Date()): AiInteractionProps {
    this.props.failureReason = String(reason ?? '').slice(0, 500);
    this.transition('BLOCKED', now);
    this.record(
      new AiDomainEvent({
        eventName: AI_EVENTS.INTERACTION_BLOCKED,
        aggregateId: this.props.id,
        companyId: this.props.tenantId,
        userId: this.props.userId,
        payload: { interactionId: this.props.id, reason: this.props.failureReason },
        occurredAt: now,
      }),
    );
    return this.propsSnapshot;
  }

  cancel(now = new Date()): AiInteractionProps {
    this.transition('CANCELLED', now);
    return this.propsSnapshot;
  }

  complete(now = new Date()): AiInteractionProps {
    this.transition('COMPLETED', now);
    this.record(
      new AiDomainEvent({
        eventName: AI_EVENTS.INTERACTION_COMPLETED,
        aggregateId: this.props.id,
        companyId: this.props.tenantId,
        userId: this.props.userId,
        payload: {
          interactionId: this.props.id,
          inputTokens: this.props.inputTokens,
          outputTokens: this.props.outputTokens,
        },
        occurredAt: now,
      }),
    );
    return this.propsSnapshot;
  }

  public get propsSnapshot(): AiInteractionProps {
    return { ...this.props, safetyReasons: [...this.props.safetyReasons] };
  }
}
