import { ForbiddenError, NotFoundError } from "../../../../shared/errors/app.error";
import { AuditRecorderPort } from "../../../audit/application/ports/audit-recorder.port";
import { CompanyProfilePatch } from "../../domain/entities/company";
import { CompanyRepository } from "../../domain/repositories/company.repository";

export interface UpdateCompanyInput extends CompanyProfilePatch {
    companyId: number;
    actorUserId: number;
    ipAddress?: string | null;
    userAgent?: string | null;
}

/** Actualiza o perfil da empresa do contexto de tenant. */
export class UpdateCompanyUseCase {
    constructor(
        private readonly companyRepository: CompanyRepository,
        private readonly audit: AuditRecorderPort,
    ) { }

    async execute(input: UpdateCompanyInput) {
        const company =
            await this.companyRepository.findById(input.companyId);

        if (!company) {
            throw new NotFoundError("Company");
        }

        if (!company.status.isActive()) {
            throw new ForbiddenError("Company is suspended.");
        }

        const before = company.toPrimitives();

        company.updateProfile({
            name: input.name,
            nif: input.nif,
            email: input.email,
            phone: input.phone,
            timezone: input.timezone,
            locale: input.locale,
        });

        const saved = await this.companyRepository.save(company);

        const after = saved.toPrimitives();

        await this.audit.record({
            companyId: saved.id,
            actorUserId: input.actorUserId,
            action: "company.updated",
            entityType: "company",
            entityId: saved.id,
            before: before as unknown as Record<string, unknown>,
            after: after as unknown as Record<string, unknown>,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
        });

        return after;
    }
}
