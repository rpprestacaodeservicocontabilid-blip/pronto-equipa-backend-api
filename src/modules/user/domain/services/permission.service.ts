import { User } from "../entities/user.entity";
import { Permission } from "../entities/permission.entity";

export interface PermissionService {
    assignPermissionToRole(
        role: import("../entities/role.entity").Role,
        permission: Permission,
    ): Promise<void>;

    removePermissionFromRole(
        role: import("../entities/role.entity").Role,
        permissionId: number,
    ): Promise<void>;

    assign(
        user: User,
        permission: Permission,
        assignedBy?: number | null,
    ): Promise<void>;

    remove(
        user: User,
        permission: Permission,
    ): Promise<void>;

    hasPermission(
        user: User,
        permissionName: string,
        resource?: string,
    ): boolean | Promise<boolean>;

    hasAnyPermission(
        user: User,
        permissions: string[],
    ): boolean | Promise<boolean>;

    hasAllPermissions(
        user: User,
        permissions: string[],
    ): boolean | Promise<boolean>;
}