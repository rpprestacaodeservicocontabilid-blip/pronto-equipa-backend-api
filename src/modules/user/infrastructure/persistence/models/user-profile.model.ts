import {
    DataTypes,
    Model,
    Optional,
} from "sequelize";

import { sequelize } from "../../../../../infra/database";

export interface UserProfileModelAttributes {
    id: number;
    userId: number;

    bio: string | null;
    avatar: string | null;

    coverImage: string | null;

    birthDate: Date | null;

    address: string | null;
    cityId: number | null;

    website: string | null;

    createdAt: Date;
    updatedAt: Date;
}

export interface UserProfileCreationAttributes
    extends Optional<
        UserProfileModelAttributes,
        | "id"
        | "bio"
        | "avatar"
        | "coverImage"
        | "birthDate"
        | "address"
        | "cityId"
        | "website"
        | "createdAt"
        | "updatedAt"
    > { }

export class UserProfileModel
    extends Model<
        UserProfileModelAttributes,
        UserProfileCreationAttributes
    >
    implements UserProfileModelAttributes {
    declare id: number;
    declare userId: number;

    declare bio: string | null;
    declare avatar: string | null;

    declare coverImage: string | null;

    declare birthDate: Date | null;

    declare address: string | null;
    declare cityId: number | null;

    declare website: string | null;

    declare createdAt: Date;
    declare updatedAt: Date;
}

UserProfileModel.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },

        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true,
        },

        bio: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        avatar: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },

        coverImage: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },

        birthDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },

        address: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },

        cityId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },

        website: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },

        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },

        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    },
    {
        sequelize,
        tableName: "user_profiles",
        modelName: "UserProfile",
        timestamps: true,

        indexes: [
            {
                unique: true,
                fields: ["userId"],
            },
            {
                fields: ["cityId"],
            },
        ],
    },
);