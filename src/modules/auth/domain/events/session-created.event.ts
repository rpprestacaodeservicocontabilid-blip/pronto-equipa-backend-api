import { DomainEvent } from './domain-event';

export class SessionCreatedEvent extends DomainEvent {
  constructor(
    public readonly sessionId: string,
    public readonly userId: number,
    public readonly authAccountId: number,
  ) {
    super();
  }

  public get eventName(): string {
    return 'auth.session.created';
  }
}
