import { CompanyMember } from "../entities/company-member";
import { Paginated } from "./company.repository";

export interface ListMembersParams {
    page: number;
    limit: number;
    status?: string;
}

/** Membro com dados de apresentação (utilizador + papel). */
export interface CompanyMemberView {
    member: CompanyMember;
    userName: string | null;
    userEmail: string | null;
    roleName: string | null;
}

/**
 * Repositório de membros da empresa.
 *
 * Todos os métodos exigem explicitamente o `companyId` — não existe
 * nenhuma forma de consultar membros sem definir o tenant.
 */
export interface CompanyMemberRepository {
    save(member: CompanyMember): Promise<CompanyMember>;

    findById(
        companyId: number,
        memberId: number,
    ): Promise<CompanyMember | null>;

    findByCompanyAndUser(
        companyId: number,
        userId: number,
    ): Promise<CompanyMember | null>;

    listByCompany(
        companyId: number,
        params: ListMembersParams,
    ): Promise<Paginated<CompanyMemberView>>;

    /** Contagem de membros activos com o papel indicado. */
    countActiveWithRole(
        companyId: number,
        roleIds: number[],
    ): Promise<number>;

    /** Número total de membros activos (regra do último admin). */
    countActive(companyId: number): Promise<number>;
}
