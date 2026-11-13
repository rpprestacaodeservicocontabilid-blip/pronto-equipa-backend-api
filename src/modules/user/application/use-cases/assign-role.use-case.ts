import { UserRepository } from "../../domain/repositories/user.repository";
import { RoleRepository } from "../../domain/repositories/role.repository";
import { UserRoleService } from "../../domain/services/user-role.service";
import { EventPublisher } from "../ports/event-publisher";

export interface AssignRoleInput {
    userId: number;
    roleId: number;
    assignedBy?: number;
}

export class AssignRoleUseCase {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly roleRepository: RoleRepository,
        private readonly userRoleService: UserRoleService,
        private readonly eventPublisher: EventPublisher,
    ) { }

    async execute(
        input: AssignRoleInput,
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

        await this.userRoleService.assignRole(
            user,
            role,
            input.assignedBy ?? null,
        );

        await this.roleRepository.assignToUser(
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