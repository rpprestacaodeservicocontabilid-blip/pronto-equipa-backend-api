import { DomainEvent } from "./domain-event";

export class TwoFactorEnabledEvent
  extends DomainEvent
{
  constructor(
    public readonly userId: number,
    public readonly authAccountId: number,
  ) {
    super();
  }

  public get eventName(): string {
    return "auth.two-factor.enabled";
  }
}