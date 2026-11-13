import { User } from "../../../domain/entities/user.entity";
import { UserRepository } from "../../../domain/repositories/user.repository";
import { UserId } from "../../../domain/value-objects/user-id.vo";
import { UserName } from "../../../domain/value-objects/user-name.vo";
import { Email } from "../../../domain/value-objects/email.vo";
import { Phone } from "../../../domain/value-objects/phone.vo";
import { UserType } from "../../../domain/enums/user-type.enum";
import { UserStatus } from "../../../domain/enums/user-status.enum";

import {
    UserModel,
} from "../models/user.model";

export class SequelizeUserRepository
    implements UserRepository {

    /**
     * Persiste um User.
     *
     * Se o User ainda não possui ID persistido,
     * o banco de dados gera o ID automaticamente.
     *
     * Se o User já possui ID, atualizamos o registro existente.
     */
    async save(
        user: User,
    ): Promise<User> {
        const data =
            user.toPersistence();

        /*
         * Novo User.
         *
         * UserId temporário = 0.
         * Não enviamos o ID para o banco.
         * O autoIncrement gera o ID.
         */
        if (data.id === 0) {
            const model =
                await UserModel.create({
                    name: data.name,
                    email: data.email,
                    phone: data.phone ?? null,
                    type: data.type,
                    status: data.status,
                    profileId: data.profileId,
                    emailVerifiedAt: data.emailVerifiedAt,
                    termsAcceptedAt:
                        data.termsAcceptedAt ?? null,
                    lastLoginAt: data.lastLoginAt,
                    createdAt: data.createdAt,
                    updatedAt: data.updatedAt,
                    deletedAt: null,
                });

            return User.reconstitute(
                this.mapToDomain(model),
            );
        }

        /*
         * User já persistido.
         *
         * Atualizamos o registro existente.
         */
        await UserModel.update(
            {
                name: data.name,
                email: data.email,
                phone: data.phone ?? null,
                type: data.type,
                status: data.status,
                profileId:
                    data.profileId,
                emailVerifiedAt:
                    data.emailVerifiedAt,
                termsAcceptedAt:
                    data.termsAcceptedAt ?? null,
                lastLoginAt:
                    data.lastLoginAt,
                updatedAt:
                    data.updatedAt,
            },
            {
                where: {
                    id: data.id,
                },
            },
        );

        const updatedUser =
            await this.findById(data.id);

        if (!updatedUser) {
            throw new Error(
                "User could not be found after update.",
            );
        }

        return updatedUser;
    }

    async findById(
        id: number,
    ): Promise<User | null> {
        if (id <= 0) {
            return null;
        }

        const model =
            await UserModel.findByPk(id);

        if (!model) {
            return null;
        }

        return User.reconstitute(
            this.mapToDomain(model),
        );
    }

    async findByEmail(
        email: string,
    ): Promise<User | null> {
        const normalizedEmail =
            email
                .trim()
                .toLowerCase();

        if (!normalizedEmail) {
            return null;
        }

        const model =
            await UserModel.findOne({
                where: {
                    email: normalizedEmail,
                },
            });

        if (!model) {
            return null;
        }

        return User.reconstitute(
            this.mapToDomain(model),
        );
    }

    async delete(
        id: number,
    ): Promise<void> {
        if (id <= 0) {
            return;
        }

        await UserModel.destroy({
            where: {
                id,
            },
        });
    }

    async existsByEmail(
        email: string,
    ): Promise<boolean> {
        const normalizedEmail =
            email
                .trim()
                .toLowerCase();

        if (!normalizedEmail) {
            return false;
        }

        const count =
            await UserModel.count({
                where: {
                    email: normalizedEmail,
                },
            });

        return count > 0;
    }

    async findByPhone(
        phone: string,
    ): Promise<User | null> {
        const normalizedPhone =
            phone?.trim();

        if (!normalizedPhone) {
            return null;
        }

        const model =
            await UserModel.findOne({
                where: {
                    phone: normalizedPhone,
                },
            });

        if (!model) {
            return null;
        }

        return User.reconstitute(
            this.mapToDomain(model),
        );
    }

    async existsByPhone(
        phone: string,
    ): Promise<boolean> {
        const normalizedPhone =
            phone?.trim();

        if (!normalizedPhone) {
            return false;
        }

        const count =
            await UserModel.count({
                where: {
                    phone: normalizedPhone,
                },
            });

        return count > 0;
    }

    async update(
        user: User,
    ): Promise<User> {
        const data =
            user.toPersistence();

        if (data.id <= 0) {
            throw new Error(
                "Cannot update a User without a persisted ID.",
            );
        }

        await UserModel.update(
            {
                name: data.name,
                email: data.email,
                phone: data.phone ?? null,
                type: data.type,
                status: data.status,
                profileId:
                    data.profileId,
                emailVerifiedAt:
                    data.emailVerifiedAt,
                termsAcceptedAt:
                    data.termsAcceptedAt ?? null,
                lastLoginAt:
                    data.lastLoginAt,
                updatedAt:
                    data.updatedAt,
            },
            {
                where: {
                    id: data.id,
                },
            },
        );

        const updatedUser =
            await this.findById(data.id);

        if (!updatedUser) {
            throw new Error(
                "User not found after update.",
            );
        }

        return updatedUser;
    }

    async findByProfileId(
        profileId: number,
    ): Promise<User | null> {
        if (profileId <= 0) {
            return null;
        }

        const model =
            await UserModel.findOne({
                where: {
                    profileId,
                },
            });

        if (!model) {
            return null;
        }

        return User.reconstitute(
            this.mapToDomain(model),
        );
    }

    async findAll(
        filters?: {
            status?: string;
            type?: string;
            roleId?: number;
            search?: string;
            page?: number;
            limit?: number;
        },
    ): Promise<{
        data: User[];
        total: number;
    }> {
        const where: Record<
            string,
            any
        > = {};

        if (filters?.status) {
            where.status =
                filters.status;
        }

        if (filters?.type) {
            where.type =
                filters.type;
        }

        if (filters?.search) {
            const {
                Op,
            } = require("sequelize");

            const search =
                filters.search.trim();

            where[Op.or] = [
                {
                    name: {
                        [Op.like]:
                            `%${search}%`,
                    },
                },
                {
                    email: {
                        [Op.like]:
                            `%${search}%`,
                    },
                },
            ];
        }

        const page =
            filters?.page &&
                filters.page > 0
                ? filters.page
                : 1;

        const limit =
            filters?.limit &&
                filters.limit > 0
                ? filters.limit
                : 10;

        const offset =
            (page - 1) * limit;

        const {
            count,
            rows,
        } =
            await UserModel.findAndCountAll(
                {
                    where,
                    offset,
                    limit,
                    order: [
                        [
                            "id",
                            "DESC",
                        ],
                    ],
                },
            );

        const users =
            rows.map((row) =>
                User.reconstitute(
                    this.mapToDomain(
                        row,
                    ),
                ),
            );

        return {
            data: users,
            total: count,
        };
    }

    /**
     * Converte o Model Sequelize
     * para o agregado de domínio.
     */
    private mapToDomain(
        model: UserModel,
    ) {
        return {
        id: UserId.create(model.id),

        name: UserName.create(model.name),

        email: Email.create(model.email),

        phone: model.phone
            ? Phone.create(model.phone)
            : null,

        type: model.type as UserType,

        status: model.status as UserStatus,

        profileId: model.profileId ?? null,

        roles: [],

        emailVerifiedAt:
            model.emailVerifiedAt ?? null,

        termsAcceptedAt:
            model.termsAcceptedAt ?? null,

        lastLoginAt:
            model.lastLoginAt ?? null,

        createdAt: model.createdAt,

            updatedAt: model.updatedAt,
        };
    }
}