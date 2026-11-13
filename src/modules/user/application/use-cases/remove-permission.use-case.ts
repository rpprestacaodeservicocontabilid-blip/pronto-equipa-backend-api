import { UserRepository } from "../../domain/repositories/user.repository";
import { PermissionRepository } from "../../domain/repositories/permission.repository";
import { PermissionService } from "../../domain/services/permission.service";
import { EventPublisher } from "../ports/event-publisher";

export interface RemovePermissionInput {
    userId: number;
    permissionId: number;
}

export class RemovePermissionUseCase {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly permissionRepository: PermissionRepository,
        private readonly permissionService: PermissionService,
        private readonly eventPublisher: EventPublisher,
    ) { }

    async execute(
        input: RemovePermissionInput,
    ) {
        const user =
            await this.userRepository.findById(
                input.userId,
            );

        if (!user) {
            throw new Error("User not found.");
        }

        const permission =
            await this.permissionRepository.findById(
                input.permissionId,
            );

        if (!permission) {
            throw new Error(
                "Permission not found.",
            );
        }

        await this.permissionService.remove(
            user,
            permission,
        );

        await this.permissionRepository.removeFromUser(
            input.userId,
            input.permissionId,
        );

        await this.userRepository.save(user);

        await this.eventPublisher.publishMany(
            user.pullDomainEvents(),
        );

        return {
            userId: user.id,
            permissionId: permission.id,
            permissionName: permission.name,
        };
    }
}