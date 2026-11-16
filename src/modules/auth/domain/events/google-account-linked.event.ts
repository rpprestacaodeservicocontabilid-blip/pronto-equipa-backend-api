import { DomainEvent } from './domain-event';

export class GoogleAccountLinkedEvent extends DomainEvent {
  constructor(
    public readonly userId: number,
    public readonly authAccountId: number,
    public readonly googleAccountId: string,
  ) {
    super();
  }

  public get eventName(): string {
    return 'auth.google.account-linked';
  }
}
