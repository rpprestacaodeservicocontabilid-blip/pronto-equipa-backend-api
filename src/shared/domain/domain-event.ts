/**
 * ============================================================
 * DOMAIN EVENT — Módulo 03 (shared/domain)
 * ============================================================
 *
 * Definição canónica de evento de domínio: identidade única,
 * agregado de origem e instante de ocorrência.
 *
 * O `EventBus` de `shared/events/event-bus.ts` reutiliza esta
 * classe (fonte única de verdade). Os módulos legados (auth,
 * user) mantêm as suas definições locais até à migração — são
 * compatíveis estruturalmente (`eventName` + `occurredAt`).
 */

import { randomUUID } from "crypto";

export interface DomainEventProps {
  /** Identidade do agregado que originou o evento. */
  aggregateId: string | number;

  /** Instante da ocorrência. Omissão: agora. */
  occurredAt?: Date;

  /** Identidade única do evento. Omissão: UUID. */
  eventId?: string;
}

export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly aggregateId: string | number;
  public readonly occurredAt: Date;

  /** Nome canónico do evento (ex.: `user.created`). */
  public abstract readonly eventName: string;

  protected constructor(props: DomainEventProps) {
    this.eventId = props.eventId ?? randomUUID();
    this.aggregateId = props.aggregateId;
    this.occurredAt = props.occurredAt ?? new Date();
  }
}
