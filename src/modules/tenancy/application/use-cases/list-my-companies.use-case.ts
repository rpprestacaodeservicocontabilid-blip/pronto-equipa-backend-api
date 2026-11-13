import { CompanyRepository } from "../../domain/repositories/company.repository";

/**
 * Lista as empresas onde o utilizador é membro activo.
 *
 * É este o catálogo que alimenta o seletor de empresa do cliente —
 * nunca é uma listagem global.
 */
export class ListMyCompaniesUseCase {
    constructor(
        private readonly companyRepository: CompanyRepository,
    ) { }

    async execute(userId: number) {
        const companies =
            await this.companyRepository.findCompaniesByUserId(userId);

        return {
            data: companies.map((company) => {
                const primitives = company.toPrimitives();

                return {
                    id: primitives.id,
                    name: primitives.name,
                    slug: primitives.slug,
                    status: primitives.status,
                    timezone: primitives.timezone,
                    locale: primitives.locale,
                };
            }),
        };
    }
}
