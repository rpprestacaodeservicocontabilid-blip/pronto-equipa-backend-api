import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
} from "sequelize";

import { sequelize } from "../../../../../infra/database";

export class RefreshTokenModel extends Model<
    InferAttributes<RefreshTokenModel>,
    InferCreationAttributes<RefreshTokenModel>
> {
    declare id: CreationOptional<number>;

    declare authAccountId: number;

    declare sessionId: number;

    declare tokenHash: string;

    declare expiresAt: Date;

    declare revokedAt: Date | null;

    declare replacedByTokenId: number | null;

    declare createdAt: Date;
}

RefreshTokenModel.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },

        authAccountId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },

        sessionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },

        tokenHash: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },

        expiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },

        revokedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },

        replacedByTokenId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },

        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    },
    {
        sequelize,
        tableName: "auth_refresh_tokens",
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ["tokenHash"],
            },
            {
                fields: ["authAccountId"],
            },
            {
                fields: ["sessionId"],
            },
        ],
    },
);