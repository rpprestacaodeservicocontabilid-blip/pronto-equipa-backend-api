import { Company } from '../entities/company';
import { CompanyStatusValue } from '../value-objects/company-status';

export interface Paginated<T> {
  rows: T[];
  total: number;
}

export interface ListCompaniesParams {
  page: number;
  limit: number;
  search?: string;
  status?: CompanyStatusValue;
}

/**
 * Repositório de empresas (tenant aggregate root).
 *
 * Os métodos `findBy*` devolvem `null` quando o registo não existe —
 * o isolamento por empresa é garantido pelo chamador (nunca por
 * filtragem implícita aqui).
 */
export interface CompanyRepository {
  save(company: Company): Promise<Company>;

  mutate(id: number, apply: (company: Company) => void): Promise<{ before: Company; after: Company } | null>;

  countByStatus(): Promise<Record<CompanyStatusValue, number>>;

  findById(id: number): Promise<Company | null>;

  findBySlug(slug: string): Promise<Company | null>;

  existsBySlug(slug: string): Promise<boolean>;

  /** Lista paginada para a administração de plataforma. */
  findAll(params: ListCompaniesParams): Promise<Paginated<Company>>;

  /** Empresas onde o utilizador é membro activo. */
  findCompaniesByUserId(userId: number): Promise<Company[]>;
}
