/**
 * Common Types
 * Tipos e interfaces compartilhadas entre módulos
 */

/**
 * Resposta padrão da API
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    statusCode: number;
    timestamp: string;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Contexto de usuário authenticado
 */
export interface AuthUser {
  id: number;
  email: string;
  role: 'user' | 'admin' | 'moderator';
  cityId: number;
  iat: number;
  exp: number;
}

/**
 * Contexto de tenant (empresa) resolvido por request.
 *
 * Sem PostgreSQL/RLS, o isolamento multiempresa é garantido à
 * aplicação: todas as operações por empresa recebem obrigatoriamente
 * o `companyId` resolvido a partir do token + membership validado.
 */
export interface TenantContext {
  companyId: number;
}

/**
 * Parâmetros de paginação
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

/**
 * Resultado de paginação
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Opções de query
 */
export interface QueryOptions {
  where?: any;
  order?: Array<[string, string]>;
  include?: any[];
  limit?: number;
  offset?: number;
  raw?: boolean;
  subQuery?: boolean;
}

/**
 * Status de entidades
 */
export enum EntityStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DELETED = 'DELETED',
  ARCHIVED = 'ARCHIVED',
  PENDING = 'PENDING',
}

/**
 * Roles de usuário
 */
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

/**
 * Status de match
 */
export enum MatchStatus {
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  FINISHED = 'FINISHED',
  CANCELLED = 'CANCELLED',
}

/**
 * Status de torneio
 */
export enum TournamentStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  FINISHED = 'FINISHED',
  CANCELLED = 'CANCELLED',
}

/**
 * Status de pagamento
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  REFUNDED = 'REFUNDED',
}

/**
 * Status de reserva
 */
export enum BookingStatus {
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}
