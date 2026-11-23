import { DomainEvent } from '../../../../shared/domain/domain-event';

/**
 * Nomes de eventos publicados pelo módulo (secção 17.1).
 *
 * Os eventos são gravados transaccionalmente (outbox) e propagados
 * por um job próprio — nunca bloqueiam a operação de negócio.
 */
export const AI_EVENTS = {
  CONVERSATION_CREATED: 'ai-assistant.conversation.created',
  CONVERSATION_ARCHIVED: 'ai-assistant.conversation.archived',
  INTERACTION_STARTED: 'ai-assistant.interaction.started',
  INTERACTION_COMPLETED: 'ai-assistant.interaction.completed',
  INTERACTION_FAILED: 'ai-assistant.interaction.failed',
  INTERACTION_BLOCKED: 'ai-assistant.interaction.blocked',
  TOOL_EXECUTION_REQUESTED: 'ai-assistant.tool.execution-requested',
  TOOL_EXECUTED: 'ai-assistant.tool.executed',
  TOOL_FAILED: 'ai-assistant.tool.failed',
  TOOL_DENIED: 'ai-assistant.tool.denied',
  ACTION_PROPOSED: 'ai-assistant.action.proposed',
  ACTION_CONFIRMED: 'ai-assistant.action.confirmed',
  ACTION_APPROVED: 'ai-assistant.action.approved',
  ACTION_REJECTED: 'ai-assistant.action.rejected',
  ACTION_EXECUTED: 'ai-assistant.action.executed',
  KNOWLEDGE_INDEXED: 'ai-assistant.knowledge.indexed',
  KNOWLEDGE_REVOKED: 'ai-assistant.knowledge.revoked',
  USAGE_RECORDED: 'ai-assistant.usage.recorded',
  QUOTA_EXCEEDED: 'ai-assistant.quota.exceeded',
  SAFETY_INCIDENT_DETECTED: 'ai-assistant.safety.incident-detected',
  EVALUATION_COMPLETED: 'ai-assistant.evaluation.completed',
} as const;

export type AiEventName = (typeof AI_EVENTS)[keyof typeof AI_EVENTS];

export interface AiDomainEventProps {
  eventName: AiEventName;
  aggregateId: string;
  companyId: number | null;
  userId?: number | null;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}

/**
 * Evento de domínio do assistente.
 *
 * `companyId` é sempre explícito: o isolamento entre tenants é
 * reforçado na propagação, nunca inferido do payload.
 */
export class AiDomainEvent extends DomainEvent {
  readonly eventName: AiEventName;
  readonly companyId: number | null;
  readonly userId: number | null;
  readonly payload: Record<string, unknown>;

  constructor(props: AiDomainEventProps) {
    super({ aggregateId: props.aggregateId, occurredAt: props.occurredAt });
    this.eventName = props.eventName;
    this.companyId = props.companyId;
    this.userId = props.userId ?? null;
    this.payload = props.payload ?? {};
  }
}
