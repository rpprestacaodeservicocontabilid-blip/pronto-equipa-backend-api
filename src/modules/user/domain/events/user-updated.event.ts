export class UserUpdatedEvent {
    public readonly occurredAt: Date;

    public readonly eventName =
        "user.updated";

    constructor(
        public readonly userId: number,
        public readonly changedFields: string[],
    ) {
        this.occurredAt = new Date();
    }
}