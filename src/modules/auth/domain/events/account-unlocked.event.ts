import { DomainEvent } from './domain-event';

export class AccountUnlockedEvent extends DomainEvent {
  constructor(
    public readonly userId: number,
    public readonly authAccountId: number,
  ) {
    super();
  }

  public get eventName(): string {
    return 'auth.account.unlocked';
  }
}
