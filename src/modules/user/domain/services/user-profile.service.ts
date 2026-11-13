import { UserProfile } from "../entities/user-profile.entity";

export interface UserProfileService {
    validateUpdate(
        input: {
            firstName?: string;
            lastName?: string | null;
            displayName?: string | null;
            bio?: string | null;
            avatar?: string | null;
            coverImage?: string | null;
            cityId?: number | null;
            provinceId?: number | null;
            countryId?: number | null;
            dateOfBirth?: Date | null;
        },
    ): Promise<void>;

    updateProfile(
        profile: UserProfile,
        input: {
            firstName?: string;
            lastName?: string | null;
            displayName?: string | null;
            bio?: string | null;
            cityId?: number | null;
            provinceId?: number | null;
            countryId?: number | null;
            dateOfBirth?: Date | null;
        },
    ): Promise<void>;
}