/** Papel (role) visível no âmbito de uma empresa. */
export interface CompanyRoleView {
    id: number;
    name: string;
    description: string | null;
    /** `true` para roles globais do sistema (não editáveis). */
    isSystem: boolean;
    /** `null` quando a role é global. */
    companyId: number | null;
    permissionNames: string[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Repositório de papéis no âmbito de uma empresa.
 *
 * As leituras devolvem as roles PRÓPRIAS da empresa (`companyId`
 * igual ao contexto) mais as roles globais do sistema (`companyId`
 * null) — que servem de base para os membros. As escritas são
 * sempre restritas à empresa do contexto.
 */
export interface CompanyRoleRepository {
    /**
     * Roles visíveis na empresa: próprias + globais.
     * `companyId` obrigatório.
     */
    listForCompany(companyId: number): Promise<CompanyRoleView[]>;

    findById(
        companyId: number,
        roleId: number,
    ): Promise<CompanyRoleView | null>;

    /** Nome já usado na empresa (para unicidade). */
    existsName(
        companyId: number,
        name: string,
        excludeRoleId?: number,
    ): Promise<boolean>;

    create(input: {
        companyId: number;
        name: string;
        description: string | null;
    }): Promise<CompanyRoleView>;

    update(input: {
        companyId: number;
        roleId: number;
        name: string;
        description: string | null;
    }): Promise<CompanyRoleView>;

    /** Apaga uma role própria da empresa. */
    delete(companyId: number, roleId: number): Promise<void>;

    /** Substitui o conjunto de permissões de uma role da empresa. */
    setPermissions(
        companyId: number,
        roleId: number,
        permissionNames: string[],
    ): Promise<string[]>;
}
