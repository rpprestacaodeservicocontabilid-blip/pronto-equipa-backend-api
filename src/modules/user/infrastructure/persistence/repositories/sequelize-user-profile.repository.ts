import { UserProfile } from "../../../domain/entities/user-profile.entity";
import { UserProfileRepository } from "../../../domain/repositories/user-profile.repository";
import { ProfileType } from "../../../domain/enums/profile-type.enum";
import { Avatar } from "../../../domain/value-objects/avatar.vo";

import {
    UserProfileModel,
} from "../models/user-profile.model";

import {
    UserModel,
} from "../models/user.model";

export class SequelizeUserProfileRepository
    implements UserProfileRepository {
    async save(
        profile: UserProfile,
    ): Promise<UserProfile> {
        const data =
            profile.toPersistence();

        const attributes = {
            userId: data.userId,
            bio: data.bio,
            avatar: data.avatar,
            coverImage: data.coverImage,
            birthDate: data.dateOfBirth,
            address: data.address,
            cityId: data.cityId,
            website: data.website,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
        };

        const model = data.id
            ? (
                  await UserProfileModel.upsert({
                      id: data.id,
                      ...attributes,
                  })
              )[0]
            : await UserProfileModel.create(
                  attributes,
              );

        return this.toDomain(model);
    }

    async findById(
        profileId: number,
    ): Promise<UserProfile | null> {
        const model =
            await UserProfileModel.findByPk(
                profileId,
            );

        if (!model) {
            return null;
        }

        return this.toDomain(model);
    }

    async findByUserId(
        userId: number,
    ): Promise<UserProfile | null> {
        const model =
            await UserProfileModel.findOne({
                where: { userId },
            });

        if (!model) {
            return null;
        }

        return this.toDomain(model);
    }

    async update(
        profile: UserProfile,
    ): Promise<UserProfile> {
        const data =
            profile.toPersistence();

        await UserProfileModel.update(
            {
                bio: data.bio,
                avatar: data.avatar,
                coverImage: data.coverImage,
                birthDate: data.dateOfBirth,
                address: data.address,
                cityId: data.cityId,
                website: data.website,
                updatedAt: data.updatedAt,
            },
            {
                where: { id: data.id },
            },
        );

        return this.findById(data.id) as Promise<UserProfile>;
    }

    async findUserName(
        userId: number,
    ): Promise<string | null> {
        const user =
            await UserModel.findByPk(userId);

        return user ? user.name : null;
    }

    private async toDomain(
        model: UserProfileModel,
    ): Promise<UserProfile> {
        const userName =
            await this.findUserName(model.userId);

        const [firstName, ...rest] = (userName ?? "User").split(" ");

        return UserProfile.reconstitute({
            id: model.id,
            userId: model.userId,
            type: ProfileType.PERSONAL,
            firstName: firstName || "User",
            lastName: rest.length > 0 ? rest.join(" ") : null,
            displayName: userName,
            phone: null,
            avatar: Avatar.create(model.avatar),
            coverImage: model.coverImage ?? null,
            bio: model.bio,
            address: model.address,
            website: model.website,
            cityId: model.cityId,
            provinceId: null,
            countryId: null,
            dateOfBirth: model.birthDate,
            createdAt: model.createdAt,
            updatedAt: model.updatedAt,
        });
    }

    async delete(
        profileId: number,
    ): Promise<void> {
        await UserProfileModel.destroy({
            where: {
                id: profileId,
            },
        });
    }
}
