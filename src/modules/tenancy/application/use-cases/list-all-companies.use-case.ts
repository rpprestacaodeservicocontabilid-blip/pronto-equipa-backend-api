import { CompanyRepository } from '../../domain/repositories/company.repository';

export interface ListAllCompaniesInput {
  page?: number;
  limit?: number;
  search?: string;
}

/**
 * Listagem global de empresas — reservada à administração de
 * plataforma (`/api/v1/platform/companies`).
 */
export class ListAllCompaniesUseCase {
  constructor(private readonly companyRepository: CompanyRepository) {}

  async execute(input: ListAllCompaniesInput) {
    const page = Math.max(1, Number(input.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(input.limit) || 20));

    const { rows, total } = await this.companyRepository.findAll({
      page,
      limit,
      search: input.search,
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
