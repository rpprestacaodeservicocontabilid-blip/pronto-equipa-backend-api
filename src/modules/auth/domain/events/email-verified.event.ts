import { DomainEvent } from "./domain-event";

export class EmailVerifiedEvent
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
    return "auth.email.verified";
  }
}