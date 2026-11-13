import { UserRepository } from "../../../domain/repositories/user.repository";

export interface AuthAccountCreatedEvent {
    userId: number;
    email: string;
}

export class AuthAccountCreatedHandler {
    constructor(
        private readonly userRepository: UserRepository,
    ) { }

    async handle(
        event: AuthAccountCreatedEvent,
    ): Promise<void> {
        const user =
            await this.userRepository.findById(
                event.userId,
            );

        if (!user) {
            return;
        }

        if (
            user.email.getValue() !== event.email
        ) {
            user.changeEmail(
                event.email,
            );

            await this.userRepository.save(
                user,
            );
        }
    }
}