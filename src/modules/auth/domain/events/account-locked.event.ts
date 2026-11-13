import { DomainEvent } from "./domain-event";

export class AccountLockedEvent
  extends DomainEvent
{
  constructor(
    public readonly userId: number,
    public readonly authAccountId: number,
    public readonly lockedUntil: Date | null,
  ) {
    super();
  }

  public get eventName(): string {
    return "auth.account.locked";
  }
}