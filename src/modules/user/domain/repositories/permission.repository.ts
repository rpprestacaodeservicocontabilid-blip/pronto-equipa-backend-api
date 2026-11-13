import { Permission } from "../entities/permission.entity";

export interface PermissionRepository {
    save(
        permission: Permission,
    ): Promise<Permission>;

    update(
        permission: Permission,
    ): Promise<Permission>;

    findById(
        permissionId: number,
    ): Promise<Permission | null>;

    findByName(
        name: string,
    ): Promise<Permission | null>;

    findByRoleId(
        roleId: number,
    ): Promise<Permission[]>;

    findAll(
        filters?: {
            resource?: string;
            action?: string;
            active?: boolean;
        },
    ): Promise<Permission[]>;

    /** Permissões herdadas dos papéis do utilizador. */
    findByUserId(
        userId: number,
    ): Promise<Permission[]>;

    findDirectByUserId(
        userId: number,
    ): Promise<Permission[]>;

    assignToUser(
        userId: number,
        permissionId: number,
        assignedBy?: number | null,
    ): Promise<void>;

    removeFromUser(
        userId: number,
        permissionId: number,
    ): Promise<void>;

    delete(
        permissionId: number,
    ): Promise<void>;
}