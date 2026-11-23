import { AiDomainEvent } from '../../domain/events/ai-domain.event';
import type {
  AiDomainEventEnvelope,
  EventPublisherPort,
} from '../ports/event-publisher.port';

/** Qualquer agregado que drene os seus eventos de domínio. */
export interface AiEventSource {
  pullDomainEvents(): unknown[];
}

/**
 * Drena e publica os eventos dos agregados (secção 17.1, RN-AI-028).
 *
 * Chamado DEPOIS de a transacção estar concluída: uma falha de
 * propagação nunca compromete a operação de negócio já gravada.
 */
export async function aiPublishEvents(
  publisher: EventPublisherPort,
  sources: readonly AiEventSource[],
): Promise<void> {
  const envelopes: AiDomainEventEnvelope[] = [];

  for (const source of sources) {
    for (const event of source.pullDomainEvents()) {
      if (!(event instanceof AiDomainEvent)) continue;
      envelopes.push({
        eventName: event.eventName,
        aggregateId: String(event.aggregateId),
        tenantId: event.companyId,
        userId: event.userId,
        occurredAt: event.occurredAt,
        payload: { ...event.payload, eventId: event.eventId },
      });
    }
  }

  if (envelopes.length) await publisher.publishAll(envelopes);
}
