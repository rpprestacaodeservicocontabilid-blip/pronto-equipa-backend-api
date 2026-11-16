export class ProfileUpdatedEvent {
  public readonly occurredAt: Date;

  public readonly eventName = 'user.profile.updated';

  constructor(
    public readonly userId: number,
    public readonly profileId: number,
    public readonly changedFields: string[],
  ) {
    this.occurredAt = new Date();
  }
}
