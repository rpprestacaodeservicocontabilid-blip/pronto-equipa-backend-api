export class UserDeactivatedEvent {
    public readonly occurredAt: Date;

    public readonly eventName =
        "user.deactivated";

    constructor(
        public readonly userId: number,
        public readonly reason: string | null = null,
    ) {
        this.occurredAt = new Date();
    }
}