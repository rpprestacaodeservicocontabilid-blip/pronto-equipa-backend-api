/**
 * Contrato de leitura de empresas consumido por outros módulos
 * (authorization, platform) sem aceder à infraestrutura directamente.
 */
export interface CompanySummary {
    id: number;
    name: string;
    slug: string;
    status: string;
}

export interface CompanyReaderPort {
    findById(id: number): Promise<CompanySummary | null>;
}
