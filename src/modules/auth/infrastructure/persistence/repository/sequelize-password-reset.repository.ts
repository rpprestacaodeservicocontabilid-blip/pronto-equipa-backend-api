import { PasswordResetToken } from "../../../domain/entities/password-reset-token.entity";
import { PasswordResetRepository } from "../../../domain/repositories/password-reset.repository";

import { PasswordResetTokenModel } from "../model/password-reset-token.model";

export class SequelizePasswordResetTokenRepository
    implements PasswordResetRepository {
    async save(
        token: PasswordResetToken,
    ): Promise<PasswordResetToken> {
        const existing =
            await PasswordResetTokenModel.findByPk(
                token.id,
            );

        const data = {
            id: token.id,
            authAccountId: token.authAccountId,
            tokenHash: token.token,
            expiresAt: token.expiresAt,
            usedAt: token.usedAt,
            createdAt: token.createdAt,
        };

        if (existing) {
            await existing.update(data);

            return existing.toDomain();
        }

        const model =
            await PasswordResetTokenModel.create(data);

        return model.toDomain();
    }

    async create(
        data: {
            authAccountId: number;
        },
    ): Promise<{ value: string }> {
        const crypto = require("crypto");
        const tokenValue = crypto.randomBytes(32).toString("hex");

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);

        await PasswordResetTokenModel.create({
            authAccountId: data.authAccountId,
            tokenHash: tokenValue,
            expiresAt,
            usedAt: null,
            createdAt: new Date(),
        } as any);

        return { value: tokenValue };
    }

    async findById(
        id: number,
    ): Promise<PasswordResetToken | null> {
        const model =
            await PasswordResetTokenModel.findByPk(id);

        return model
            ? model.toDomain()
            : null;
    }

    async findByToken(
        token: string,
    ): Promise<PasswordResetToken | null> {
        const model =
            await PasswordResetTokenModel.findOne({
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
    ): Promise<PasswordResetToken | null> {
        const model =
            await PasswordResetTokenModel.findOne({
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
    ): Promise<PasswordResetToken | null> {
        const model =
            await PasswordResetTokenModel.findOne({
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
        await PasswordResetTokenModel.update(
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
    ): Promise<PasswordResetToken[]> {
        const models = await PasswordResetTokenModel.findAll({
            where: {
                authAccountId,
            },
        });

        return models.map((model) => model.toDomain());
    }

    async delete(
        id: number,
    ): Promise<void> {
        await PasswordResetTokenModel.destroy({
            where: {
                id,
            },
        });
    }

    async deleteExpired(): Promise<void> {
        const { Op } = require("sequelize");
        await PasswordResetTokenModel.destroy({
            where: {
                expiresAt: {
                    [Op.lt]: new Date(),
                },
            },
        });
    }
}