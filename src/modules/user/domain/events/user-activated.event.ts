export class UserActivatedEvent {
  public readonly occurredAt: Date;

  public readonly eventName = 'user.activated';

  constructor(public readonly userId: number) {
    this.occurredAt = new Date();
  }
}
