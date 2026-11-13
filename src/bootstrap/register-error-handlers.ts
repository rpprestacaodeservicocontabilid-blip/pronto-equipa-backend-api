/**
 * ============================================================
 * TRATAMENTO CENTRALIZADO DE ERROS (BOOT-006)
 * ============================================================
 *
 * Registado por ÚLTIMO:
 *
 *   1. handler 404 — respostas consistentes para rotas
 *      inexistentes, sem expor estrutura interna;
 *   2. `HttpError` — erros operacionais do bootstrap: 4xx
 *      devolvem a mensagem pedida; 5xx são MASCARADOS para
 *      "Internal server error" (nunca detalhes internos);
 *   3. `errorMiddleware` — mapeia AppError / Zod / Sequelize /
 *      erros genéricos para o envelope `{ success, error }`.
 */

import type {
  Express,
  NextFunction,
  Request,
  Response,
} from "express";

import { errorMiddleware } from "../shared/middlewares/error.middleware";

import type { ApplicationContext } from "./types/application-context";

/**
 * Erro operacional do bootstrap/módulos.
 *
 * Use `statusCode` 4xx para erros que o cliente pode corrigir
 * (a mensagem é devolvida) e 5xx para falhas internas (a
 * mensagem NUNCA chega ao cliente).
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "HTTP_ERROR",
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function registerErrorHandlers(
  app: Express,
  context: ApplicationContext,
): void {
  app.use((req: Request, res: Response, _next: NextFunction) => {
    res.status(404).json({
      success: false,
      error: {
        message: "Route not found",
        path: req.originalUrl,
        method: req.method,
      },
    });
  });

  // Erros operacionais explícitos (HttpError).
  app.use(
    (
      error: unknown,
      _req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      if (!(error instanceof HttpError)) {
        next(error);
        return;
      }

      if (res.headersSent) {
        next(error);
        return;
      }

      const internal = error.statusCode >= 500;

      if (internal) {
        context.logger.error(
          `[bootstrap] internal error: ${error.message}`,
          error,
        );
      }

      res.status(internal ? 500 : error.statusCode).json({
        success: false,
        error: {
          message: internal ? "Internal server error" : error.message,
          code: internal ? "INTERNAL_SERVER_ERROR" : error.code,
          statusCode: internal ? 500 : error.statusCode,
          timestamp: new Date().toISOString(),
        },
      });
    },
  );

  app.use(errorMiddleware);
}
