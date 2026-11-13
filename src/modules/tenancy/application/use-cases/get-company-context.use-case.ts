import { NotFoundError } from "../../../../shared/errors/app.error";
import { MembershipReaderPort } from "../ports/membership-reader.port";
import { CompanyRepository } from "../../domain/repositories/company.repository";

/**
 * Devolve o contexto da empresa activa para o cliente
 * (`GET /api/v1/company/context`): dados da empresa, papel do
 * membro e permissões efectivas dentro deste tenant.
 */
export class GetCompanyContextUseCase {
    constructor(
        private readonly companyRepository: CompanyRepository,
        private readonly membershipReader: MembershipReaderPort,
    ) { }

    async execute(input: { companyId: number; userId: number }) {
        const company =
            await this.companyRepository.findById(input.companyId);

        if (!company) {
            throw new NotFoundError("Company");
        }

        const membership = await this.membershipReader.findMembership(
            input.companyId,
            input.userId,
        );

        const permissions = await this.membershipReader.findPermissionNames(
            input.companyId,
            input.userId,
        );

        const primitives = company.toPrimitives();

        return {
            company: primitives,
            membership: {
                roleId: membership?.roleId ?? null,
                status: membership?.memberStatus ?? "REMOVED",
            },
            permissions,
        };
    }
}
