/**
 * Augmentação global do Express: identificador de correliação
 * de cada requisição (BOOT-007 — observabilidade).
 */

declare global {
  namespace Express {
    interface Request {
      /**
       * UUID de correliação da requisição. Vem do header
       * `X-Request-Id` quando válido; caso contrário é gerado.
       * É devolvido no header `X-Request-Id` da resposta e
       * incluído nos logs HTTP.
       */
      requestId?: string;
    }
  }
}

export {};
