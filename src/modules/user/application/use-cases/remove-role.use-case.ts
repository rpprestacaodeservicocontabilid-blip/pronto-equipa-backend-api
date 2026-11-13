import { UserRepository } from "../../domain/repositories/user.repository";
import { RoleRepository } from "../../domain/repositories/role.repository";
import { UserRoleService } from "../../domain/services/user-role.service";
import { EventPublisher } from "../ports/event-publisher";

export interface RemoveRoleInput {
    userId: number;
    roleId: number;
}

export class RemoveRoleUseCase {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly roleRepository: RoleRepository,
        private readonly userRoleService: UserRoleService,
        private readonly eventPublisher: EventPublisher,
    ) { }

    async execute(
        input: RemoveRoleInput,
    ) {
        const user =
            await this.userRepository.findById(
                input.userId,
            );

        if (!user) {
            throw new Error("User not found.");
        }

        const role =
            await this.roleRepository.findById(
                input.roleId,
            );

        if (!role) {
            throw new Error("Role not found.");
        }

        await this.userRoleService.removeRole(
            user,
            role.id,
        );

        await this.roleRepository.removeFromUser(
            input.userId,
            input.roleId,
        );

        await this.userRepository.save(user);

        await this.eventPublisher.publishMany(
            user.pullDomainEvents(),
        );

        return {
            userId: user.id,
            roleId: role.id,
            roleName: role.name,
        };
    }
}