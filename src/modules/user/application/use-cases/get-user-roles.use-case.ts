import { RoleRepository } from "../../domain/repositories/role.repository";

export interface GetUserRolesInput {
    userId: number;
}

export class GetUserRolesUseCase {
    constructor(
        private readonly roleRepository: RoleRepository,
    ) { }

    async execute(
        input: GetUserRolesInput,
    ) {
        return this.roleRepository.findByUserId(
            input.userId,
        );
    }
}