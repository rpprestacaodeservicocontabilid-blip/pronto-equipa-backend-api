import { DomainEvent } from "./domain-event";

export class PasswordResetRequestedEvent
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
    return "auth.password-reset.requested";
  }
}