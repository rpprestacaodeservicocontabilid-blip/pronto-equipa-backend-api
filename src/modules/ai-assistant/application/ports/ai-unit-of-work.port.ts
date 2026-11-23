/**
 * Unidade de trabalho multi-repositório (invariante: operações
 * relacionadas são atómicas).
 *
 * A aplicação recebe sempre a instância pelo composition root e nunca
 * conhece o ORM subjacente.
 */
export interface AiUnitOfWorkPort {
  run<T>(tenantId: number, operation: () => Promise<T>): Promise<T>;
}
