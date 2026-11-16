export class UserCreatedEvent {
  public readonly occurredAt: Date;

  public readonly eventName = 'user.created';

  constructor(
    public readonly userId: number,
    public readonly email: string,
    public readonly userType: string,
  ) {
    this.occurredAt = new Date();
  }
}
