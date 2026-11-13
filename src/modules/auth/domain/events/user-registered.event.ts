import { DomainEvent } from "./domain-event";

export class UserRegisteredEvent
  extends DomainEvent
{
  constructor(
    public readonly userId: number,
    public readonly authAccountId: number,
    public readonly email: string,
  ) {
    super();
  }

  public get eventName(): string {
    return "auth.user.registered";
  }
}