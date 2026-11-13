import {
    PermissionService,
} from "../../domain/services/permission.service";

import { User } from "../../domain/entities/user.entity";
import { Permission } from "../../domain/entities/permission.entity";

export class PermissionServiceImpl
    implements PermissionService {
    async assignPermissionToRole(
        role: import("../../domain/entities/role.entity").Role,
        permission: Permission,
    ): Promise<void> {
        role.addPermission(permission);
    }

    async removePermissionFromRole(
        role: import("../../domain/entities/role.entity").Role,
        permissionId: number,
    ): Promise<void> {
        role.removePermission(permissionId);
    }

    async assign(
        user: User,
        permission: Permission,
        assignedBy?: number | null,
    ): Promise<void> {
        if (!user.isActive()) {
            throw new Error(
                "Cannot assign permission to inactive user.",
            );
        }

        user.assignPermission(permission, assignedBy ?? null);
    }

    async remove(
        user: User,
        permission: Permission,
    ): Promise<void> {
        user.removePermission(permission);
    }

    async hasPermission(
        user: User,
        permission: string,
        resource?: string,
    ): Promise<boolean> {
        return user.hasPermission(permission, resource);
    }

    async hasAnyPermission(
        user: User,
        permissions: string[],
    ): Promise<boolean> {
        return permissions.some((permission) => user.hasPermission(permission));
    }

    async hasAllPermissions(
        user: User,
        permissions: string[],
    ): Promise<boolean> {
        return permissions.every((permission) => user.hasPermission(permission));
    }
}