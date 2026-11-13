import {
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
} from "sequelize";

import { sequelize } from "../../../../../infra/database";
import { PasswordResetToken } from "../../../domain/entities/password-reset-token.entity";

export class PasswordResetTokenModel extends Model<
    InferAttributes<PasswordResetTokenModel>,
    InferCreationAttributes<PasswordResetTokenModel>
> {
    declare id: number;

    declare authAccountId: number;

    declare tokenHash: string;

    declare expiresAt: Date;

    declare usedAt: Date | null;

    declare createdAt: Date;

    toDomain(): PasswordResetToken {
        return PasswordResetToken.create({
            id: this.id,
            authAccountId: this.authAccountId,
            token: this.tokenHash,
            expiresAt: this.expiresAt,
            createdAt: this.createdAt,
            usedAt: this.usedAt,
        });
    }
}

PasswordResetTokenModel.init(
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

        tokenHash: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },

        expiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },

        usedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },

        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    },
    {
        sequelize,
        tableName: "auth_password_reset_tokens",
        timestamps: false,
        indexes: [
            {
                fields: ["authAccountId"],
            },
        ],
    },
);