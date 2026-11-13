import { ConflictError, NotFoundError } from "../../../../shared/errors/app.error";
import { AuditRecorderPort } from "../../../audit/application/ports/audit-recorder.port";
import { CompanyRoleRepository } from "../../domain/repositories/company-role.repository";

export interface UpdateCompanyRoleInput {
    companyId: number;
    roleId: number;
    actorUserId: number;
    name: string;
    description?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
}

/** Renomeia/descreve um papel próprio da empresa. */
export class UpdateCompanyRoleUseCase {
    constructor(
        private readonly roleRepository: CompanyRoleRepository,
        private readonly audit: AuditRecorderPort,
    ) { }

    async execute(input: UpdateCompanyRoleInput) {
        const before = await this.roleRepository.findById(
            input.companyId,
            input.roleId,
        );

        if (!before) {
            throw new NotFoundError("Company role");
        }

        const name = input.name.trim();

        if (
            await this.roleRepository.existsName(
                input.companyId,
                name,
                input.roleId,
            )
        ) {
            throw new ConflictError("Company role already exists.");
        }

        const updated = await this.roleRepository.update({
            companyId: input.companyId,
            roleId: input.roleId,
            name,
            description: input.description?.trim() || null,
        });

        await this.audit.record({
            companyId: input.companyId,
            actorUserId: input.actorUserId,
            action: "company.role.updated",
            entityType: "company_role",
            entityId: input.roleId,
            before: before as unknown as Record<string, unknown>,
            after: updated as unknown as Record<string, unknown>,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
        });

        return updated;
    }
}
