import { User } from "../entities/user.entity";
import { Role } from "../entities/role.entity";

export interface UserRoleService {
    assignRole(
        user: User,
        role: Role,
        assignedBy?: number | null,
    ): Promise<void>;

    removeRole(
        user: User,
        roleId: number,
    ): Promise<void>;

    hasRole(
        user: User,
        roleName: string,
    ): boolean | Promise<boolean>;

    hasAnyRole(
        user: User,
        roleNames: string[],
    ): boolean | Promise<boolean>;
}