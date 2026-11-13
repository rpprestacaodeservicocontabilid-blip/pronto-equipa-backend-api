/**
 * Pagination Utilities
 * Funções auxiliares para paginação
 */

import { PaginationParams, PaginatedResult } from '../types';

/**
 * Calcula offset baseado em page e limit
 */
export function calculateOffset(page: number = 1, limit: number = 10): number {
  return (page - 1) * limit;
}

/**
 * Valida e normaliza parâmetros de paginação
 */
export function normalizePaginationParams(params: PaginationParams): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(Math.max(1, params.limit || 10), 100); // Máximo 100
  const offset = calculateOffset(page, limit);

  return { page, limit, offset };
}

/**
 * Formata resultado de paginação
 */
export function formatPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}
