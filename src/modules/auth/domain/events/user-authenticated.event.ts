import { DomainEvent } from "./domain-event";

export class UserAuthenticatedEvent
  extends DomainEvent
{
  constructor(
    public readonly userId: number,
    public readonly authAccountId: number,
    public readonly sessionId: string,
  ) {
    super();
  }

  public get eventName(): string {
    return "auth.user.authenticated";
  }
}