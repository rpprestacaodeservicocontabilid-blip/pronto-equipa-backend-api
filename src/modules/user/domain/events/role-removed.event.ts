export class RoleRemovedEvent {
    public readonly occurredAt: Date;

    public readonly eventName =
        "user.role.removed";

    constructor(
        public readonly userId: number,
        public readonly roleId: number,
        public readonly roleName: string,
    ) {
        this.occurredAt = new Date();
    }
}