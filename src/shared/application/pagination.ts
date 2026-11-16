/**
 * ============================================================
 * PAGINATION — Módulo 03 (shared/application)
 * ============================================================
 *
 * Validação e normalização dos parâmetros de paginação,
 * independente do transporte (query string chega como string).
 *
 * Diferente de `shared/utils/pagination.ts` (funções legadas
 * que *arredondam* para valores válidos), esta versão REJEITA
 * entradas inválidas com `DomainError` — os casos de uso devem
 * falhar cedo em vez de devolver páginas inesperadas.
 */

import { DomainError } from '../domain/domain-error';
import { ValueObject } from '../domain/value-object';
import type { PaginatedResult } from '../types';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

export interface PaginationInput {
  page?: number | string | null;
  limit?: number | string | null;
}

// `type` (e não `interface`) para satisfazer o constraint
// `Record<string, unknown>` do ValueObject.
type PaginationProps = {
  page: number;
  limit: number;
};

function parseInteger(
  value: number | string | null | undefined,
  field: string,
  fallback: number,
  options: { min: number; max: number },
): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  let parsed: number;

  if (typeof value === 'number') {
    parsed = value;
  } else if (/^\d+$/.test(value.trim())) {
    parsed = Number.parseInt(value.trim(), 10);
  } else {
    throw new DomainError(
      `Invalid pagination "${field}": ${JSON.stringify(value)}`,
      'INVALID_PAGINATION',
      { field, value },
    );
  }

  if (!Number.isInteger(parsed) || parsed < options.min || parsed > options.max) {
    throw new DomainError(
      `Invalid pagination "${field}": ${JSON.stringify(value)}`,
      'INVALID_PAGINATION',
      { field, value, min: options.min, max: options.max },
    );
  }

  return parsed;
}

/**
 * Value object de paginação. Exemplo:
 *
 *   const p = Pagination.from(req.query); // valida e normaliza
 *   const rows = await repo.list(p.offset, p.limit);
 *   return p.toResult(rows, total);
 */
export class Pagination extends ValueObject<PaginationProps> {
  private constructor(page: number, limit: number) {
    super({ page, limit });
  }

  /** Valida e normaliza `page`/`limit` (aceita strings da query). */
  public static from(
    input: PaginationInput = {},
    defaults: { page?: number; limit?: number } = {},
  ): Pagination {
    const page = parseInteger(input.page, 'page', defaults.page ?? DEFAULT_PAGE, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
    });

    const limit = parseInteger(input.limit, 'limit', defaults.limit ?? DEFAULT_LIMIT, {
      min: 1,
      max: MAX_LIMIT,
    });

    return new Pagination(page, limit);
  }

  /** Constrói directamente a partir de inteiros já validados. */
  public static of(page: number, limit: number): Pagination {
    return Pagination.from({ page, limit });
  }

  public get page(): number {
    return this.props.page;
  }

  public get limit(): number {
    return this.props.limit;
  }

  public get offset(): number {
    return (this.page - 1) * this.limit;
  }

  /** Número total de páginas para um total de registos. */
  public total(total: number): number {
    if (!Number.isInteger(total) || total < 0) {
      throw new DomainError(`Invalid total: ${total}`, 'INVALID_PAGINATION', {
        total,
      });
    }

    return Math.ceil(total / this.limit);
  }

  /** Formata o resultado paginado padrão da API. */
  public toResult<T>(items: T[], total: number): PaginatedResult<T> {
    const totalPages = this.total(total);

    return {
      data: items,
      total,
      page: this.page,
      limit: this.limit,
      totalPages,
      hasNextPage: this.page < totalPages,
      hasPreviousPage: this.page > 1,
    };
  }
}
