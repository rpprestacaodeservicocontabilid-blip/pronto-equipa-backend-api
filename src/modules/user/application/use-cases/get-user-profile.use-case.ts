import { UserProfileRepository } from '../../domain/repositories/user-profile.repository';
import { UserCachePort } from '../ports/user-cache.port';

export interface GetUserProfileInput {
  userId: number;
}

export class GetUserProfileUseCase {
  constructor(
    private readonly profileRepository: UserProfileRepository,
    private readonly cache: UserCachePort,
  ) {}

  async execute(input: GetUserProfileInput) {
    const cacheKey = `user-profile:${input.userId}`;

    const cached = await this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const profile = await this.profileRepository.findByUserId(input.userId);

    if (!profile) {
      throw new Error('User profile not found.');
    }

    const result = profile.toPrimitives();

    await this.cache.set(cacheKey, result, 300);

    return result;
  }
}
