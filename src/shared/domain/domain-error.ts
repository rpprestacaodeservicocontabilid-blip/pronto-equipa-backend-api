/**
 * ============================================================
 * DOMAIN ERROR — Módulo 03 (shared/domain)
 * ============================================================
 *
 * Erro de domínio puro: violação de regra/invariante que o
 * negócio NÃO transforma em excepção HTTP aqui.
 *
 *   - a camada de aplicação prefere `Result.fail(error)`;
 *   - a apresentação mapeia `DomainError` → 4xx quando o
 *     erro sobe até ao middleware (`code` + `details`).
 *
 * Não herda de `AppError` (que carrega statusCode de HTTP):
 * domínio não conhece transportes.
 */

export class DomainError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = "DOMAIN_ERROR",
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
