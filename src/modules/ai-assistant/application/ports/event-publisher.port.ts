/**
 * Porta de publicação de eventos de domínio (secção 17.1).
 *
 * Os eventos são gravados transaccionalmente (outbox) e propagados
 * fora da operação — falhas de propagação nunca comprometem a
 * transacção de negócio (RN-AI-028).
 */
export interface AiDomainEventEnvelope {
  eventName: string;
  aggregateId: string;
  tenantId: number | null;
  userId: number | null;
  occurredAt: Date;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface EventPublisherPort {
  publish(event: AiDomainEventEnvelope): Promise<void>;
  publishAll(events: AiDomainEventEnvelope[]): Promise<void>;
}
