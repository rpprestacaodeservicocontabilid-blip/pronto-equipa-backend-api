import {
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
} from "sequelize";

import { sequelize } from "../../../../../infra/database";
import { VerificationToken } from "../../../domain/entities/verification-token.entity";
import { TokenType } from "../../../domain/enums/token-type.enum";

export class VerificationTokenModel extends Model<
    InferAttributes<VerificationTokenModel>,
    InferCreationAttributes<VerificationTokenModel>
> {
    declare id: number;
    declare authAccountId: number;
    declare tokenHash: string;
    declare type: string;
    declare expiresAt: Date;
    declare usedAt: Date | null;
    declare createdAt: Date;

    declare attempts: number;

    declare channel: string | null;

    declare destination: string | null;

    toDomain(): VerificationToken {
        return VerificationToken.create({
            id: this.id,
            authAccountId: this.authAccountId,
            token: this.tokenHash,
            type: this.type as TokenType,
            expiresAt: this.expiresAt,
            createdAt: this.createdAt,
            usedAt: this.usedAt,
            attempts: this.attempts ?? 0,
            channel: this.channel ?? null,
            destination: this.destination ?? null,
        });
    }
}

VerificationTokenModel.init(
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

        type: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: "EMAIL_VERIFICATION",
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

        attempts: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },

        channel: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },

        destination: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: "auth_verification_tokens",
        timestamps: false,
        indexes: [
            {
                fields: ["authAccountId"],
            },
            {
                fields: ["authAccountId", "type"],
            },
        ],
    },
);