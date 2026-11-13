import { DomainEvent } from "../domain/domain-event";

// Definição canónica de evento de domínio (Módulo 03) —
// re-exportada para manter o contrato histórico deste módulo.
export { DomainEvent };

export type EventHandler<T extends DomainEvent = DomainEvent> = (
  event: T,
) => Promise<void> | void;

export abstract class EventBus {
  abstract subscribe<T extends DomainEvent>(
    eventName: string,
    handler: EventHandler<T>,
  ): void;

  abstract unsubscribe(eventName: string, handler: EventHandler): void;

  abstract publish<T extends DomainEvent>(event: T): Promise<void>;

  abstract publishAll<T extends DomainEvent>(events: T[]): Promise<void>;
}

export class InMemoryEventBus implements EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  subscribe<T extends DomainEvent>(
    eventName: string,
    handler: EventHandler<T>,
  ): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName)!.push(handler as EventHandler);
  }

  unsubscribe(eventName: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventName);
    if (!handlers) return;

    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    const handlers = this.handlers.get(event.eventName) || [];

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(
          `Error handling event ${event.eventName}:`,
          error,
        );
      }
    }
  }

  async publishAll<T extends DomainEvent>(
    events: T[],
  ): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
