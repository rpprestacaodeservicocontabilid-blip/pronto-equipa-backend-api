import { UserRepository } from "../../domain/repositories/user.repository";
import { PermissionRepository } from "../../domain/repositories/permission.repository";
import { PermissionService } from "../../domain/services/permission.service";

export interface CheckUserPermissionInput {
    userId: number;
    permissionId?: number;
    permission?: string;
    resource?: string;
}

export class CheckUserPermissionUseCase {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly permissionRepository: PermissionRepository,
        private readonly permissionService: PermissionService,
    ) { }

    async execute(
        input: CheckUserPermissionInput,
    ): Promise<boolean> {
        const user =
            await this.userRepository.findById(
                input.userId,
            );

        if (!user) {
            return false;
        }

        let permissionName = input.permission;

        if (!permissionName && input.permissionId !== undefined) {
            const permission =
                await this.permissionRepository.findById(
                    input.permissionId,
                );

            permissionName = permission?.name;
        }

        if (!permissionName) {
            return false;
        }

        if (
            await this.permissionService.hasPermission(
                user,
                permissionName,
                input.resource,
            )
        ) {
            return true;
        }

        const directPermissions =
            await this.permissionRepository.findDirectByUserId(
                input.userId,
            );

        if (
            directPermissions.some(
                (permission) =>
                    permission.name === permissionName,
            )
        ) {
            return true;
        }

        const rolePermissions =
            await this.permissionRepository.findByUserId(
                input.userId,
            );

        return rolePermissions.some(
            (permission) =>
                permission.name === permissionName,
        );
    }
}