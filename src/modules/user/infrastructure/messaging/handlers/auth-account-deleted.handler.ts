import { UserRepository } from '../../../domain/repositories/user.repository';

export interface AuthAccountDeletedEvent {
  userId: number;
}

export class AuthAccountDeletedHandler {
  constructor(private readonly userRepository: UserRepository) {}

  async handle(event: AuthAccountDeletedEvent): Promise<void> {
    const user = await this.userRepository.findById(event.userId);

    if (!user) {
      return;
    }

    await this.userRepository.delete(event.userId);
  }
}
