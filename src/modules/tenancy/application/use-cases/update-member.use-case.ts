import { Op } from "sequelize";

import { BadRequestError, NotFoundError } from "../../../../shared/errors/app.error";
import { AuditRecorderPort } from "../../../audit/application/ports/audit-recorder.port";
import { CompanyMember } from "../../domain/entities/company-member";
import { CompanyMemberRepository } from "../../domain/repositories/company-member.repository";
import { RoleModel } from "../../../user/infrastructure/persistence/models/role.model";

export interface UpdateMemberInput {
    companyId: number;
    memberId: number;
    actorUserId: number;
    roleId?: number;
    status?: string;
    ipAddress?: string | null;
    userAgent?: string | null;
}

/**
 * Altera o papel ou o estado de um membro da empresa.
 *
 * A remoção é lógica (`REMOVED`) e mantém o registo para auditoria.
 * A regra do último admin activo é validada aqui — uma empresa não
 * pode ficar sem nenhum admin activo.
 */
export class UpdateMemberUseCase {
    constructor(
        private readonly memberRepository: CompanyMemberRepository,
        private readonly audit: AuditRecorderPort,
    ) { }

    async execute(input: UpdateMemberInput) {
        const member = await this.memberRepository.findById(
            input.companyId,
            input.memberId,
        );

        if (!member) {
            throw new NotFoundError("Company member");
        }

        const before = member.toPrimitives();

        const deactivates =
            input.status === "REMOVED" || input.status === "SUSPENDED";

        if (deactivates) {
            await this.guardLastAdmin(input.companyId, member.roleId);
        }

        if (input.roleId !== undefined && input.roleId !== member.roleId) {
            await this.guardLastAdmin(input.companyId, member.roleId);
            member.changeRole(input.roleId);
        }

        if (input.status !== undefined) {
            this.applyStatus(member, input.status);
        }

        const saved = await this.memberRepository.save(member);
        const after = saved.toPrimitives();

        await this.audit.record({
            companyId: input.companyId,
            actorUserId: input.actorUserId,
            action: "company.member.updated",
            entityType: "company_member",
            entityId: saved.id,
            before: before as unknown as Record<string, unknown>,
            after: after as unknown as Record<string, unknown>,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
        });

        return after;
    }

    private applyStatus(member: CompanyMember, status: string): void {
        switch (status) {
            case "ACTIVE":
                member.activate();
                break;
            case "SUSPENDED":
                member.suspend();
                break;
            case "REMOVED":
                member.remove();
                break;
            default:
                throw new BadRequestError("Invalid member status.");
        }
    }

    /** Impede afastar/suspender o último admin activo da empresa. */
    private async guardLastAdmin(
        companyId: number,
        currentRoleId: number,
    ): Promise<void> {
        const adminRoleIds = await this.resolveAdminRoleIds();

        if (!adminRoleIds.includes(currentRoleId)) {
            return;
        }

        const activeAdmins = await this.memberRepository.countActiveWithRole(
            companyId,
            adminRoleIds,
        );

        if (activeAdmins <= 1) {
            throw new BadRequestError(
                "Company must keep at least one active admin.",
            );
        }
    }

    /** Ids das roles globais consideradas admin (ADMIN, SUPER_ADMIN). */
    private async resolveAdminRoleIds(): Promise<number[]> {
        const roles = await RoleModel.findAll({
            where: {
                name: { [Op.in]: ["ADMIN", "SUPER_ADMIN"] },
            },
            attributes: ["id"],
        });

        return roles.map((role) => role.id);
    }
}
