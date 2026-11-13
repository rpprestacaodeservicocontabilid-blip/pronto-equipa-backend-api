import { UserRepository } from "../../domain/repositories/user.repository";

export interface GetUserByEmailInput {
    email: string;
}

export class GetUserByEmailUseCase {
    constructor(
        private readonly userRepository: UserRepository,
    ) { }

    async execute(
        input: GetUserByEmailInput,
    ) {
        const user =
            await this.userRepository.findByEmail(
                input.email,
            );

        if (!user) {
            throw new Error("User not found.");
        }

        return user.toPrimitives();
    }
}