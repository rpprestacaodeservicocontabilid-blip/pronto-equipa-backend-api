import { DomainEvent } from "./domain-event";

export class SessionRevokedEvent
  extends DomainEvent
{
  constructor(
    public readonly sessionId: string,
    public readonly userId: number,
    public readonly reason?: string,
  ) {
    super();
  }

  public get eventName(): string {
    return "auth.session.revoked";
  }
}