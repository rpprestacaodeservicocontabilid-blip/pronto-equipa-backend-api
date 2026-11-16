import { DomainEvent } from './domain-event';

export class LoginFailedEvent extends DomainEvent {
  constructor(
    public readonly email: string,
    public readonly ipAddress: string | null,
    public readonly reason: string,
  ) {
    super();
  }

  public get eventName(): string {
    return 'auth.login.failed';
  }
}
