/**
 * Contrato de leitura de vínculos (membro ↔ empresa) usado pelo
 * módulo authorization para resolver e validar o contexto de tenant.
 */
export interface MembershipSummary {
    companyId: number;
    userId: number;
    roleId: number;
    memberStatus: string;
    companyStatus: string;
}

export interface MembershipReaderPort {
    /**
     * Devolve o vínculo do utilizador à empresa, qualquer que seja o
     * estado — o chamador decide se aceita (ex.: só `ACTIVE`).
     * `null` quando não existe vínculo algum.
     */
    findMembership(
        companyId: number,
        userId: number,
    ): Promise<MembershipSummary | null>;

    /** Ids das permissões do papel exercido pelo membro na empresa. */
    findPermissionNames(
        companyId: number,
        userId: number,
    ): Promise<string[]>;

    /** Ids das empresas onde o utilizador é membro activo. */
    findActiveCompanyIds(userId: number): Promise<number[]>;
}
