import { UserRepository } from '../../domain/repositories/user.repository';
import { EventPublisher } from '../../domain/events/event-publisher.port';
import { UserCachePort } from '../ports/user-cache.port';

export interface ActivateUserInput {
  userId: number;
}

export class ActivateUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly eventPublisher: EventPublisher,
    private readonly cache: UserCachePort,
  ) {}

  async execute(input: ActivateUserInput) {
    const user = await this.userRepository.findById(input.userId);

    if (!user) {
      throw new Error('User not found.');
    }

    user.activate();

    await this.userRepository.save(user);

    await this.cache.delete(`user:${user.id}`);

    await this.eventPublisher.publishMany(user.pullDomainEvents());

    return user.toPrimitives();
  }
}
