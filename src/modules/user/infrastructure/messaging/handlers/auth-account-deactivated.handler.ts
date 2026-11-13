import { UserRepository } from "../../../domain/repositories/user.repository";

export interface AuthAccountDeactivatedEvent {
    userId: number;
    reason?: string;
}

export class AuthAccountDeactivatedHandler {
    constructor(
        private readonly userRepository: UserRepository,
    ) { }

    async handle(
        event: AuthAccountDeactivatedEvent,
    ): Promise<void> {
        const user =
            await this.userRepository.findById(
                event.userId,
            );

        if (!user) {
            return;
        }

        if (user.isActive()) {
            user.deactivate(
                event.reason,
            );

            await this.userRepository.save(
                user,
            );
        }
    }
}