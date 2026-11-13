import { UserProfileRepository } from "../../domain/repositories/user-profile.repository";
import { UserProfileService } from "../../domain/services/user-profile.service";
import { UserProfile } from "../../domain/entities/user-profile.entity";
import { StorageGateway } from "../../domain/gateways/storage.gateway";

export class UserProfileServiceImpl
    implements UserProfileService {
    constructor(
        private readonly profileRepository: UserProfileRepository,
        private readonly storageGateway: StorageGateway,
    ) { }

    async validateUpdate(
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
    ): Promise<void> {
        if (
            input.firstName !== undefined &&
            !input.firstName.trim()
        ) {
            throw new Error(
                "First name is required.",
            );
        }

        if (
            input.avatar !== undefined &&
            input.avatar !== null &&
            input.avatar.length > 500
        ) {
            throw new Error(
                "Avatar URL cannot exceed 500 characters.",
            );
        }

        if (
            input.coverImage !== undefined &&
            input.coverImage !== null &&
            input.coverImage.length > 500
        ) {
            throw new Error(
                "Cover image URL cannot exceed 500 characters.",
            );
        }

        if (
            input.bio !== undefined &&
            input.bio !== null &&
            input.bio.length > 2000
        ) {
            throw new Error(
                "Bio cannot exceed 2000 characters.",
            );
        }

        if (
            input.dateOfBirth !== undefined &&
            input.dateOfBirth !== null &&
            new Date(input.dateOfBirth) > new Date()
        ) {
            throw new Error(
                "Date of birth cannot be in the future.",
            );
        }

        for (const [label, value] of [
            ["City ID", input.cityId],
            ["Province ID", input.provinceId],
            ["Country ID", input.countryId],
        ] as const) {
            if (
                value !== undefined &&
                value !== null &&
                (!Number.isInteger(value) || value <= 0)
            ) {
                throw new Error(
                    `${label} must be a positive integer.`,
                );
            }
        }
    }

    async updateProfile(
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
    ): Promise<void> {
        profile.update({
            firstName: input.firstName,
            lastName: input.lastName,
            displayName: input.displayName,
            bio: input.bio,
            cityId: input.cityId,
            provinceId: input.provinceId,
            countryId: input.countryId,
            dateOfBirth: input.dateOfBirth,
        });

        await this.profileRepository.save(profile);
    }
}