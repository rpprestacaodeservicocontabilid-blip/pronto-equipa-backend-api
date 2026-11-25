import { NotFoundError } from '../../../../shared/errors/app.error';
import { CompanyStatusValue } from '../../domain/value-objects/company-status';
import { CompanyRepository } from '../../domain/repositories/company.repository';

export interface ListAllCompaniesInput {
  page?: number;
  limit?: number;
  search?: string;
  status?: CompanyStatusValue;
}

/**
 * Listagem global de empresas — reservada à administração de
 * plataforma (`/api/v1/platform/companies`).
 */
export class ListAllCompaniesUseCase {
  constructor(private readonly companyRepository: CompanyRepository) {}

  async get(id: number) {
    const company = await this.companyRepository.findById(id);
    if (!company) throw new NotFoundError('Company');
    return company.toPrimitives();
  }

  async summary() {
    const counts = await this.companyRepository.countByStatus();
    return { active: counts.ACTIVE, suspended: counts.SUSPENDED, total: counts.ACTIVE + counts.SUSPENDED };
  }

  async execute(input: ListAllCompaniesInput) {
    const page = Math.max(1, Number(input.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(input.limit) || 20));

    const { rows, total } = await this.companyRepository.findAll({
      page,
      limit,
      search: input.search,
      status: input.status,
    });

    return {
      data: rows.map((company) => company.toPrimitives()),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
