export class PermissionRemovedEvent {
    public readonly occurredAt: Date;

    public readonly eventName =
        "user.permission.removed";

    constructor(
        public readonly roleId: number,
        public readonly permissionId: number,
        public readonly permissionName: string,
    ) {
        this.occurredAt = new Date();
    }
}