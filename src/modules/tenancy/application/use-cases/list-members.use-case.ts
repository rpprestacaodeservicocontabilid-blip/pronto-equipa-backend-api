import { BadRequestError } from "../../../../shared/errors/app.error";
import { CompanyMemberRepository } from "../../domain/repositories/company-member.repository";

export interface ListMembersInput {
    companyId: number;
    page?: number;
    limit?: number;
    status?: string;
}

/** Lista os membros da empresa do contexto de tenant. */
export class ListMembersUseCase {
    constructor(
        private readonly memberRepository: CompanyMemberRepository,
    ) { }

    async execute(input: ListMembersInput) {
        if (!input.companyId) {
            throw new BadRequestError("Company context is required.");
        }

        const page = Math.max(1, Number(input.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(input.limit) || 20));

        const { rows, total } =
            await this.memberRepository.listByCompany(input.companyId, {
                page,
                limit,
                status: input.status,
            });

        return {
            data: rows.map((view) => {
                const member = view.member.toPrimitives();

                return {
                    id: member.id,
                    userId: member.userId,
                    roleId: member.roleId,
                    status: member.status,
                    roleName: view.roleName,
                    userName: view.userName,
                    userEmail: view.userEmail,
                    joinedAt: member.joinedAt,
                    createdAt: member.createdAt,
                };
            }),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
        };
    }
}
