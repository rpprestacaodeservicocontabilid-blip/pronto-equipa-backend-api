import { UserRepository } from '../../domain/repositories/user.repository';
import { UserValidationService } from '../../domain/services/user-validation.service';
import { EventPublisher } from '../../domain/events/event-publisher.port';
import { UserCachePort } from '../ports/user-cache.port';

export interface UpdateUserInput {
  userId: number;

  name?: string;
  phone?: string | null;
  email?: string;
}

export class UpdateUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly validationService: UserValidationService,
    private readonly eventPublisher: EventPublisher,
    private readonly cache: UserCachePort,
  ) {}

  async execute(input: UpdateUserInput) {
    const user = await this.userRepository.findById(input.userId);

    if (!user) {
      throw new Error('User not found.');
    }

    await this.validationService.validateUpdate(input);

    if (input.name !== undefined) {
      user.changeName(input.name);
    }

    if (input.phone !== undefined) {
      user.changePhone(input.phone);
    }

    if (input.email !== undefined) {
      const existing = await this.userRepository.findByEmail(input.email);

      if (existing && !existing.id.equals(user.id)) {
        throw new Error('Email is already in use.');
      }

      user.changeEmail(input.email);
    }

    await this.userRepository.save(user);

    await this.cache.delete(`user:${user.id}`);

    await this.eventPublisher.publishMany(user.pullDomainEvents());

    return user.toPrimitives();
  }
}
