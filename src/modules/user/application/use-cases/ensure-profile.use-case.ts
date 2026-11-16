import { UserProfileRepository } from '../../domain/repositories/user-profile.repository';
import { UserRepository } from '../../domain/repositories/user.repository';
import { UserProfile } from '../../domain/entities/user-profile.entity';
import { ProfileType } from '../../domain/enums/profile-type.enum';

export interface EnsureProfileInput {
  userId: number;
}

export class EnsureProfileUseCase {
  constructor(
    private readonly profileRepository: UserProfileRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async execute(input: EnsureProfileInput) {
    const user = await this.userRepository.findById(input.userId);

    if (!user) {
      throw new Error('User not found.');
    }

    const existing = await this.profileRepository.findByUserId(input.userId);

    if (existing) {
      return existing.toPrimitives();
    }

    const fullName = user.name.getValue().trim();

    const [firstName, ...rest] = fullName.split(/\s+/);

    const now = new Date();

    const created = await this.profileRepository.save(
      UserProfile.create({
        id: 0,
        userId: input.userId,
        type: ProfileType.PERSONAL,
        firstName: firstName || 'User',
        lastName: rest.length > 0 ? rest.join(' ') : null,
        displayName: fullName,
        phone: null,
        avatar: null,
        coverImage: null,
        bio: null,
        address: null,
        website: null,
        cityId: null,
        provinceId: null,
        countryId: null,
        dateOfBirth: null,
        createdAt: now,
        updatedAt: now,
      }),
    );

    return created.toPrimitives();
  }
}
