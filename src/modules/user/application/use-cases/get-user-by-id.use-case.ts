import { UserRepository } from "../../domain/repositories/user.repository";
import { UserCachePort } from "../ports/user-cache.port";

export interface GetUserByIdInput {
    userId: number;
}

export class GetUserByIdUseCase {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly cache: UserCachePort,
    ) { }

    async execute(
        input: GetUserByIdInput,
    ) {
        const cacheKey = `user:${input.userId}`;

        const cached =
            await this.cache.get(cacheKey);

        if (cached) {
            return cached;
        }

        const user =
            await this.userRepository.findById(
                input.userId,
            );

        if (!user) {
            throw new Error("User not found.");
        }

        const result = user.toPrimitives();

        await this.cache.set(
            cacheKey,
            result,
            300,
        );

        return result;
    }
}