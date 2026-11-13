import {
    UserRoleService,
} from "../../domain/services/user-role.service";

import { User } from "../../domain/entities/user.entity";
import { Role } from "../../domain/entities/role.entity";

export class UserRoleServiceImpl
    implements UserRoleService {
    async assignRole(
        user: User,
        role: Role,
        assignedBy?: number | null,
    ): Promise<void> {
        if (!user.isActive()) {
            throw new Error(
                "Cannot assign role to inactive user.",
            );
        }

        user.assignRole(role);
    }

    async removeRole(
        user: User,
        roleId: number,
    ): Promise<void> {
        user.removeRole(roleId);
    }

    async hasRole(
        user: User,
        roleName: string,
    ): Promise<boolean> {
        return user.hasRole(roleName);
    }

    hasAnyRole(
        user: User,
        roleNames: string[],
    ): boolean {
        return roleNames.some((roleName) => user.hasRole(roleName));
    }
}