import { Op, WhereOptions } from "sequelize";

import { Company } from "../../../domain/entities/company";
import {
    CompanyRepository,
    ListCompaniesParams,
    Paginated,
} from "../../../domain/repositories/company.repository";
import { CompanyModel } from "../model/company.model";
import { CompanyMemberModel } from "../model/company-member.model";

/**
 * Implementação Sequelize do repositório de empresas.
 *
 * A listagem global (`findAll`) é reservada à administração de
 * plataforma — as rotas de empresa usam `findCompaniesByUserId`
 * ou o middleware de tenant.
 */
export class SequelizeCompanyRepository
    implements CompanyRepository {
    async save(company: Company): Promise<Company> {
        const data = company.toPrimitives();

        const model =
            data.id === 0
                ? await CompanyModel.create({
                    name: data.name,
                    slug: data.slug,
                    nif: data.nif,
                    email: data.email,
                    phone: data.phone,
                    status: data.status,
                    timezone: data.timezone,
                    locale: data.locale,
                    settings: data.settings,
                    createdAt: data.createdAt,
                    updatedAt: data.updatedAt,
                })
                : await CompanyModel.findByPk(data.id).then(async (existing) => {
                    if (!existing) {
                        throw new Error("Company not found.");
                    }

                    existing.set({
                        name: data.name,
                        slug: data.slug,
                        nif: data.nif,
                        email: data.email,
                        phone: data.phone,
                        status: data.status,
                        timezone: data.timezone,
                        locale: data.locale,
                        settings: data.settings,
                        updatedAt: data.updatedAt,
                    });

                    return existing.save();
                });

        return Company.reconstitute({
            id: model.id,
            name: model.name,
            slug: model.slug,
            nif: model.nif,
            email: model.email,
            phone: model.phone,
            status: model.status,
            timezone: model.timezone,
            locale: model.locale,
            settings: model.settings,
            createdAt: model.createdAt,
            updatedAt: model.updatedAt,
        });
    }

    async findById(id: number): Promise<Company | null> {
        const model = await CompanyModel.findByPk(id);

        return model ? this.toDomain(model) : null;
    }

    async findBySlug(slug: string): Promise<Company | null> {
        const model = await CompanyModel.findOne({
            where: { slug },
        });

        return model ? this.toDomain(model) : null;
    }

    async existsBySlug(slug: string): Promise<boolean> {
        const count = await CompanyModel.count({
            where: { slug },
        });

        return count > 0;
    }

    async findAll(
        params: ListCompaniesParams,
    ): Promise<Paginated<Company>> {
        const where: WhereOptions<CompanyModel> = {};

        if (params.search?.trim()) {
            const term = `%${params.search.trim()}%`;

            where[Op.or as never] = [
                { name: { [Op.like]: term } },
                { slug: { [Op.like]: term } },
                { nif: { [Op.like]: term } },
            ] as never;
        }

        const offset = (params.page - 1) * params.limit;

        const { rows, count } = await CompanyModel.findAndCountAll({
            where,
            order: [["name", "ASC"]],
            limit: params.limit,
            offset,
        });

        return {
            rows: rows.map((model) => this.toDomain(model)),
            total: count,
        };
    }

    async findCompaniesByUserId(
        userId: number,
    ): Promise<Company[]> {
        const models = await CompanyModel.findAll({
            include: [
                {
                    model: CompanyMemberModel,
                    as: "members",
                    required: true,
                    where: {
                        userId,
                        status: "ACTIVE",
                    },
                },
            ],
            order: [["name", "ASC"]],
        });

        return models.map((model) => this.toDomain(model));
    }

    private toDomain(model: CompanyModel): Company {
        return Company.reconstitute({
            id: model.id,
            name: model.name,
            slug: model.slug,
            nif: model.nif,
            email: model.email,
            phone: model.phone,
            status: model.status,
            timezone: model.timezone,
            locale: model.locale,
            settings: model.settings,
            createdAt: model.createdAt,
            updatedAt: model.updatedAt,
        });
    }
}
