import { NotFoundError } from "../../../../shared/errors/app.error";
import { AuditRecorderPort } from "../../../audit/application/ports/audit-recorder.port";
import { CompanyRoleRepository } from "../../domain/repositories/company-role.repository";

export interface SetCompanyRolePermissionsInput {
    companyId: number;
    roleId: number;
    actorUserId: number;
    permissionNames: string[];
    ipAddress?: string | null;
    userAgent?: string | null;
}

/** Substitui o conjunto de permissões de um papel da empresa. */
export class SetCompanyRolePermissionsUseCase {
    constructor(
        private readonly roleRepository: CompanyRoleRepository,
        private readonly audit: AuditRecorderPort,
    ) { }

    async execute(input: SetCompanyRolePermissionsInput) {
        const before = await this.roleRepository.findById(
            input.companyId,
            input.roleId,
        );

        if (!before) {
            throw new NotFoundError("Company role");
        }

        const permissionNames = await this.roleRepository.setPermissions(
            input.companyId,
            input.roleId,
            [...new Set(input.permissionNames)],
        );

        const after = await this.roleRepository.findById(
            input.companyId,
            input.roleId,
        );

        await this.audit.record({
            companyId: input.companyId,
            actorUserId: input.actorUserId,
            action: "company.role.permissions.set",
            entityType: "company_role",
            entityId: input.roleId,
            before: {
                permissionNames: before.permissionNames,
            },
            after: { permissionNames },
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
        });

        return after ?? { ...before, permissionNames };
    }
}
