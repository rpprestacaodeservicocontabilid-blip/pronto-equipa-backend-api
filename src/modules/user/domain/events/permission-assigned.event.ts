export class PermissionAssignedEvent {
    public readonly occurredAt: Date;

    public readonly eventName =
        "user.permission.assigned";

    constructor(
        public readonly roleId: number,
        public readonly permissionId: number,
        public readonly permissionName: string,
    ) {
        this.occurredAt = new Date();
    }
}