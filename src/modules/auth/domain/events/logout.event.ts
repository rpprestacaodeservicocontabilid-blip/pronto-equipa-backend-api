import { DomainEvent } from "./domain-event";

export class LogoutEvent
  extends DomainEvent
{
  constructor(
    public readonly userId: number,
    public readonly sessionId: string,
  ) {
    super();
  }

  public get eventName(): string {
    return "auth.logout";
  }
}