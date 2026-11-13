/**
 * Porta de publicação de eventos do módulo auth.
 *
 * Nota: era aqui que existia um auto-import circular
 * (`import { EventPublisher } from "../../application/ports/event-publisher"`
 * apontava para o próprio ficheiro) — a interface é agora declarada localmente.
 */
export interface EventPublisher {
  publish(event: unknown): Promise<void>;
}

export interface AuthEventBus {
  publish(event: unknown): Promise<void>;
}

export class AuthEventPublisher
  implements EventPublisher
{
  constructor(
    private readonly eventBus: AuthEventBus,
  ) {}

  public async publish(
    event: unknown,
  ): Promise<void> {
    await this.eventBus.publish(event);
  }
}
