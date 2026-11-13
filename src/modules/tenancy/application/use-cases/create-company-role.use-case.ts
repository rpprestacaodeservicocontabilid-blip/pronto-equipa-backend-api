import { ConflictError } from "../../../../shared/errors/app.error";
import { AuditRecorderPort } from "../../../audit/application/ports/audit-recorder.port";
import { CompanyRoleRepository } from "../../domain/repositories/company-role.repository";

export interface CreateCompanyRoleInput {
    companyId: number;
    actorUserId: number;
    name: string;
    description?: string | null;
    permissionNames?: string[];
    ipAddress?: string | null;
    userAgent?: string | null;
}

/** Cria um papel próprio da empresa. */
export class CreateCompanyRoleUseCase {
    constructor(
        private readonly roleRepository: CompanyRoleRepository,
        private readonly audit: AuditRecorderPort,
    ) { }

    async execute(input: CreateCompanyRoleInput) {
        const name = input.name.trim();

        if (await this.roleRepository.existsName(input.companyId, name)) {
            throw new ConflictError("Company role already exists.");
        }

        const role = await this.roleRepository.create({
            companyId: input.companyId,
            name,
            description: input.description?.trim() || null,
        });

        let permissionNames: string[] = [];

        if (input.permissionNames?.length) {
            permissionNames = await this.roleRepository.setPermissions(
                input.companyId,
                role.id,
                input.permissionNames,
            );
        }

        const created = await this.roleRepository.findById(
            input.companyId,
            role.id,
        );

        await this.audit.record({
            companyId: input.companyId,
            actorUserId: input.actorUserId,
            action: "company.role.created",
            entityType: "company_role",
            entityId: role.id,
            after: {
                ...(created ?? role),
                permissionNames,
            } as unknown as Record<string, unknown>,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
        });

        return created ?? role;
    }
}
