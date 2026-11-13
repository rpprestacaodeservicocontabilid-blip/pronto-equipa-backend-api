import { UserRepository } from "../../domain/repositories/user.repository";
import { EventPublisher } from "../ports/event-publisher";
import { UserCachePort } from "../ports/user-cache.port";

export interface DeleteUserInput {
    userId: number;
}

export class DeleteUserUseCase {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly eventPublisher: EventPublisher,
        private readonly cache: UserCachePort,
    ) { }

    async execute(
        input: DeleteUserInput,
    ): Promise<void> {
        const user =
            await this.userRepository.findById(
                input.userId,
            );

        if (!user) {
            throw new Error("User not found.");
        }

        user.deactivate();

        await this.userRepository.save(user);

        await this.cache.delete(
            `user:${user.id}`,
        );

        await this.eventPublisher.publishMany(
            user.pullDomainEvents(),
        );
    }
}