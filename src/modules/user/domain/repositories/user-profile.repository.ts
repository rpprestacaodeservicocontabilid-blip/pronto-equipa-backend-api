import { UserProfile } from '../entities/user-profile.entity';

export interface UserProfileRepository {
  save(profile: UserProfile): Promise<UserProfile>;

  update(profile: UserProfile): Promise<UserProfile>;

  findById(profileId: number): Promise<UserProfile | null>;

  findByUserId(userId: number): Promise<UserProfile | null>;

  delete(profileId: number): Promise<void>;
}
