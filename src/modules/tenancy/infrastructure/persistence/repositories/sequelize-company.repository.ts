import { Op, WhereOptions, col, fn, where as matches } from 'sequelize';

import { Company } from '../../../domain/entities/company';
import {
  CompanyRepository,
  ListCompaniesParams,
  Paginated,
} from '../../../domain/repositories/company.repository';
import { CompanyModel } from '../models/company.model';
import { CompanyMemberModel } from '../models/company-member.model';

/**
 * Implementação Sequelize do repositório de empresas.
 *
 * A listagem global (`findAll`) é reservada à administração de
 * plataforma — as rotas de empresa usam `findCompaniesByUserId`
 * ou o middleware de tenant.
 */
export class SequelizeCompanyRepository implements CompanyRepository {
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
              throw new Error('Company not found.');
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

  async mutate(id: number, apply: (company: Company) => void) {
    return CompanyModel.sequelize!.transaction(async (transaction) => {
      const model = await CompanyModel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!model) return null;

      const before = this.toDomain(model);
      const company = this.toDomain(model);
      apply(company);
      model.set(company.toPrimitives());
      await model.save({ transaction });
      return { before, after: this.toDomain(model) };
    });
  }

  async countByStatus() {
    const counts = await CompanyModel.count({ group: ['status'] });
    return {
      ACTIVE: counts.find(row => row.status === 'ACTIVE')?.count ?? 0,
      SUSPENDED: counts.find(row => row.status === 'SUSPENDED')?.count ?? 0,
    };
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

  async findAll(params: ListCompaniesParams): Promise<Paginated<Company>> {
    const where: WhereOptions<CompanyModel> = params.status ? { status: params.status } : {};

    if (params.search?.trim()) {
      const term = '%' + params.search.trim().toLowerCase() + '%';
      Object.assign(where, {
        [Op.or]: ['name', 'slug', 'nif'].map(field =>
          matches(fn('lower', col(field)), { [Op.like]: term }),
        ),
      });
    }

    const offset = (params.page - 1) * params.limit;

    const { rows, count } = await CompanyModel.findAndCountAll({
      where,
      order: [['name', 'ASC'], ['id', 'ASC']],
      limit: params.limit,
      offset,
    });

    return {
      rows: rows.map((model) => this.toDomain(model)),
      total: count,
    };
  }

  async findCompaniesByUserId(userId: number): Promise<Company[]> {
    const models = await CompanyModel.findAll({
      include: [
        {
          model: CompanyMemberModel,
          as: 'members',
          required: true,
          where: {
            userId,
            status: 'ACTIVE',
          },
        },
      ],
      order: [['name', 'ASC']],
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
