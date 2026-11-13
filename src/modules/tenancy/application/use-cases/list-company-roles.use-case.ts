import { BadRequestError } from "../../../../shared/errors/app.error";
import { CompanyRoleRepository } from "../../domain/repositories/company-role.repository";

/** Lista os papéis visíveis na empresa do contexto (próprios + globais). */
export class ListCompanyRolesUseCase {
    constructor(
        private readonly roleRepository: CompanyRoleRepository,
    ) { }

    async execute(companyId: number) {
        if (!companyId) {
            throw new BadRequestError("Company context is required.");
        }

        const roles = await this.roleRepository.listForCompany(companyId);

        return { data: roles };
    }
}
