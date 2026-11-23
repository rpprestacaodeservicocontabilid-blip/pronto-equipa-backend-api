import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { AiDomainEvent, AI_EVENTS } from '../events/ai-domain.event';
import { AiConversationId } from '../value-objects/ai-conversation-id.vo';
import { AiConversationStatus } from '../value-objects/ai-conversation-status.vo';
import { AiValidationError } from '../errors/ai-domain.error';

export interface AiConversationProps {
  id: string;
  tenantId: number;
  userId: number;
  title: string;
  status: string;
  messageCount: number;
  lastMessageAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAiConversationInput {
  tenantId: number;
  userId: number;
  title?: string;
  id?: string;
  now?: Date;
}

const DEFAULT_TITLE = 'Nova conversa';
const MAX_TITLE_LENGTH = 160;

/**
 * Agregado principal das conversas (secção 9.1, RF-AI-001).
 *
 * Invariantes:
 *  - uma conversa empresarial pertence a um único tenant (RN-AI-006);
 *  - o dono é sempre o utilizador autenticado que a criou;
 *  - conversas arquivadas ou eliminadas não aceitam mensagens.
 */
export class AiConversation extends AggregateRoot<AiConversationProps> {
  private constructor(props: AiConversationProps) {
    super(props);
  }

  static create(input: CreateAiConversationInput): AiConversation {
    if (!Number.isSafeInteger(input.tenantId) || input.tenantId <= 0)
      throw new AiValidationError('Contexto de empresa inválido.');
    if (!Number.isSafeInteger(input.userId) || input.userId <= 0)
      throw new AiValidationError('Utilizador autenticado obrigatório.');

    const title = AiConversation.sanitizeTitle(input.title);
    const now = input.now ?? new Date();
    const id = input.id ?? AiConversationId.create().value;

    const conversation = new AiConversation({
      id,
      tenantId: input.tenantId,
      userId: input.userId,
      title,
      status: 'ACTIVE',
      messageCount: 0,
      lastMessageAt: null,
      archivedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    conversation.record(
      new AiDomainEvent({
        eventName: AI_EVENTS.CONVERSATION_CREATED,
        aggregateId: id,
        companyId: input.tenantId,
        userId: input.userId,
        payload: { conversationId: id, title },
        occurredAt: now,
      }),
    );

    return conversation;
  }

  static restore(props: AiConversationProps): AiConversation {
    if (!Number.isSafeInteger(props.tenantId) || props.tenantId <= 0)
      throw new AiValidationError('Contexto de empresa inválido.');
    return new AiConversation({ ...props, title: AiConversation.sanitizeTitle(props.title) });
  }

  private static sanitizeTitle(title?: string | null): string {
    const normalized = String(title ?? '').trim().replace(/\s+/g, ' ');
    if (!normalized) return DEFAULT_TITLE;
    if (normalized.length > MAX_TITLE_LENGTH)
      throw new AiValidationError(`O título não pode exceder ${MAX_TITLE_LENGTH} caracteres.`);
    return normalized;
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): number {
    return this.props.tenantId;
  }

  get userId(): number {
    return this.props.userId;
  }

  get title(): string {
    return this.props.title;
  }

  get status(): string {
    return this.props.status;
  }

  get messageCount(): number {
    return this.props.messageCount;
  }

  get lastMessageAt(): Date | null {
    return this.props.lastMessageAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Garante que o pedido pertence a este tenant (RN-AI-006). */
  assertBelongsTo(tenantId: number, userId: number): void {
    if (this.props.tenantId !== tenantId || this.props.userId !== userId)
      throw new AiValidationError('Conversa indisponível para este contexto.');
  }

  /** Conversa utilizável para uma nova mensagem (RN-AI-005). */
  canReceiveMessage(): boolean {
    return AiConversationStatus.from(this.props.status).isUsable;
  }

  rename(title: string, now = new Date()): AiConversationProps {
    const next = AiConversation.sanitizeTitle(title);
    if (next === this.props.title) return this.propsSnapshot;
    this.props.title = next;
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  archive(now = new Date()): AiConversationProps {
    this.transition('ARCHIVED', now);
    this.record(
      new AiDomainEvent({
        eventName: AI_EVENTS.CONVERSATION_ARCHIVED,
        aggregateId: this.props.id,
        companyId: this.props.tenantId,
        userId: this.props.userId,
        payload: { conversationId: this.props.id },
        occurredAt: now,
      }),
    );
    return this.propsSnapshot;
  }

  reactivate(now = new Date()): AiConversationProps {
    this.transition('ACTIVE', now);
    return this.propsSnapshot;
  }

  /**
   * Eliminação conforme política (RF-AI-007).
   *
   * A remoção física obedece à retenção configurada; aqui marca-se o
   * estado terminal para impedir novas interacções.
   */
  markDeleted(now = new Date()): AiConversationProps {
    this.transition('DELETED', now);
    this.props.deletedAt = now;
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  registerMessage(now = new Date()): AiConversationProps {
    if (!this.canReceiveMessage())
      throw new AiValidationError('A conversa não aceita novas mensagens.');
    this.props.messageCount += 1;
    this.props.lastMessageAt = now;
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  private transition(to: 'ACTIVE' | 'ARCHIVED' | 'DELETED', now: Date): void {
    const current = AiConversationStatus.from(this.props.status);
    const next = AiConversationStatus.from(to);
    if (!current.canTransitionTo(next))
      throw new AiValidationError(`Transição de conversa inválida: ${current.value} → ${to}.`);
    this.props.status = to;
    if (to === 'ARCHIVED') this.props.archivedAt = now;
    if (to === 'ACTIVE') this.props.archivedAt = null;
    this.props.updatedAt = now;
  }

  public get propsSnapshot(): AiConversationProps {
    return { ...this.props };
  }
}
