import { VerificationToken } from "../../../domain/entities/verification-token.entity";
import { VerificationTokenRepository, CreateOtpInput } from "../../../domain/repositories/verification-token.repository";
import { TokenType } from "../../../domain/enums/token-type.enum";

import { VerificationTokenModel } from "../model/verification-token.model";

export class SequelizeVerificationTokenRepository
    implements VerificationTokenRepository {
    async save(
        token: VerificationToken,
    ): Promise<VerificationToken> {
        const existing =
            await VerificationTokenModel.findByPk(
                token.id,
            );

        const data = {
            id: token.id,
            authAccountId: token.authAccountId,
            tokenHash: token.token,
            type: token.type,
            expiresAt: token.expiresAt,
            usedAt: token.usedAt,
            createdAt: token.createdAt,
            attempts: token.attempts,
            channel: token.channel,
            destination: token.destination,
        };

        if (existing) {
            await existing.update(data);

            return existing.toDomain();
        }

        const model =
            await VerificationTokenModel.create(data);

        return model.toDomain();
    }

    async create(
        data: {
            authAccountId: number;
            type: string;
        },
    ): Promise<{ value: string }> {
        const crypto = require("crypto");
        const tokenValue = crypto.randomBytes(32).toString("hex");

        const createdAt = new Date();
        const expiresAt = new Date(createdAt);
        expiresAt.setHours(expiresAt.getHours() + 24);

        await VerificationTokenModel.create({
            authAccountId: data.authAccountId,
            tokenHash: tokenValue,
            type: data.type,
            expiresAt,
            usedAt: null,
            createdAt,
        } as any);

        return { value: tokenValue };
    }

    async createOtp(
        data: CreateOtpInput,
    ): Promise<{ id: number }> {
        const model =
            await VerificationTokenModel.create({
                authAccountId: data.authAccountId,
                tokenHash: data.codeHash,
                type:
                    data.type ??
                    TokenType.LOGIN_OTP,
                expiresAt: data.expiresAt,
                usedAt: null,
                createdAt: new Date(),
                attempts: 0,
                channel: data.channel,
                destination: data.destination,
            } as any);

        return { id: model.id };
    }

    async findLatestActive(
        authAccountId: number,
        type: TokenType,
    ): Promise<VerificationToken | null> {
        const { Op } = require("sequelize");

        const model =
            await VerificationTokenModel.findOne({
                where: {
                    authAccountId,
                    type,
                    usedAt: null,
                    expiresAt: {
                        [Op.gt]: new Date(),
                    },
                },
                order: [
                    ["createdAt", "DESC"],
                ],
            });

        return model
            ? model.toDomain()
            : null;
    }

    async incrementAttempts(
        id: number,
    ): Promise<void> {
        await VerificationTokenModel.increment(
            "attempts",
            {
                where: { id },
            },
        );
    }

    async invalidateActive(
        authAccountId: number,
        type: TokenType,
        usedAt: Date,
    ): Promise<void> {
        await VerificationTokenModel.update(
            { usedAt },
            {
                where: {
                    authAccountId,
                    type,
                    usedAt: null,
                },
            },
        );
    }

    async findById(
        id: number,
    ): Promise<VerificationToken | null> {
        const model =
            await VerificationTokenModel.findByPk(id);

        return model
            ? model.toDomain()
            : null;
    }

    async findByToken(
        token: string,
    ): Promise<VerificationToken | null> {
        const model =
            await VerificationTokenModel.findOne({
                where: {
                    tokenHash: token,
                },
            });

        return model
            ? model.toDomain()
            : null;
    }

    async findByTokenHash(
        tokenHash: string,
    ): Promise<VerificationToken | null> {
        const model =
            await VerificationTokenModel.findOne({
                where: {
                    tokenHash,
                },
            });

        return model
            ? model.toDomain()
            : null;
    }

    async findActiveByUserId(
        userId: number,
    ): Promise<VerificationToken | null> {
        const model =
            await VerificationTokenModel.findOne({
                where: {
                    authAccountId: userId,
                    usedAt: null,
                },
                order: [
                    ["createdAt", "DESC"],
                ],
            });

        return model
            ? model.toDomain()
            : null;
    }

    async markAsUsed(
        id: number,
        usedAt: Date,
    ): Promise<void> {
        await VerificationTokenModel.update(
            {
                usedAt,
            },
            {
                where: {
                    id,
                },
            },
        );
    }

    async findByAccount(
        authAccountId: number,
        type: TokenType,
    ): Promise<VerificationToken[]> {
        const models = await VerificationTokenModel.findAll({
            where: {
                authAccountId,
                type,
            },
        });

        return models.map((model) => model.toDomain());
    }

    async delete(
        id: number,
    ): Promise<void> {
        await VerificationTokenModel.destroy({
            where: {
                id,
            },
        });
    }

    async deleteExpired(): Promise<void> {
        const { Op } = require("sequelize");
        await VerificationTokenModel.destroy({
            where: {
                expiresAt: {
                    [Op.lt]: new Date(),
                },
            },
        });
    }
}
