import { UserProfileRepository } from '../../domain/repositories/user-profile.repository';
import { UserProfileService } from '../../domain/services/user-profile.service';
import { EventPublisher } from '../../domain/events/event-publisher.port';
import { UserCachePort } from '../ports/user-cache.port';
import { Avatar } from '../../domain/value-objects/avatar.vo';
import { Phone } from '../../domain/value-objects/phone.vo';

export interface UpdateProfileInput {
  userId: number;

  firstName?: string;
  lastName?: string | null;
  displayName?: string | null;
  phone?: string | null;

  bio?: string | null;
  avatar?: string | null;
  coverImage?: string | null;
  website?: string | null;

  dateOfBirth?: Date | null;

  cityId?: number | null;
  provinceId?: number | null;
  countryId?: number | null;
}

export class UpdateProfileUseCase {
  constructor(
    private readonly profileRepository: UserProfileRepository,
    private readonly profileService: UserProfileService,
    private readonly eventPublisher: EventPublisher,
    private readonly cache: UserCachePort,
  ) {}

  async execute(input: UpdateProfileInput) {
    const profile = await this.profileRepository.findByUserId(input.userId);

    if (!profile) {
      throw new Error('User profile not found.');
    }

    await this.profileService.validateUpdate(input);

    profile.update({
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: input.displayName,
      phone:
        input.phone !== undefined ? (input.phone ? Phone.create(input.phone) : null) : undefined,
      bio: input.bio,
      avatar: input.avatar !== undefined ? Avatar.create(input.avatar) : undefined,
      coverImage: input.coverImage,
      website: input.website,
      dateOfBirth: input.dateOfBirth,
      cityId: input.cityId,
      provinceId: input.provinceId,
      countryId: input.countryId,
    });

    await this.profileRepository.save(profile);

    await this.cache.delete(`user-profile:${input.userId}`);

    await this.eventPublisher.publishMany(profile.pullDomainEvents());

    return profile.toPrimitives();
  }
}
