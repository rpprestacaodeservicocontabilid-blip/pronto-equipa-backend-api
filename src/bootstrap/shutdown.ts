/**
 * ============================================================
 * SHUTDOWN — encerramento gracioso (BOOT-008)
 * ============================================================
 *
 * Sequência:
 *
 *   1. entrar em draining → novos pedidos recebem 503;
 *   2. parar de aceitar ligações novas e concluir as em curso,
 *      com controlo de TIMEOUT (`SHUTDOWN_TIMEOUT_MS`): ao
 *      expirar força o fecho e REGISTA a falha;
 *   3. encerrar os módulos pela ordem inversa;
 *   4. libertar o contentor;
 *   5. se tudo correu bem → `stopped`; se houve falhas →
 *      `failed` e lança `ShutdownError` com TODOS os erros
 *      agregados (tratamento explícito de falhas).
 *
 * O handler é idempotente: chamadas repetidas (SIGTERM + SIGINT)
 * são ignoradas em vez de correr duas vezes o encerramento.
 */

import type { Server } from "http";

import { shutdownModules } from "./register-modules";

import type {
  ApplicationContext,
  ModuleDefinition,
} from "./types/application-context";

export type ShutdownFn = (reason: string) => Promise<void>;

export interface ShutdownOptions {
  context: ApplicationContext;
  httpServer?: Server;
  /** Devolve os módulos inicializados (ordem de init). */
  getModules?: () => ModuleDefinition[];
  /** Tempo máximo à espera das ligações em curso. */
  timeoutMs?: number;
}

/**
 * Falha de encerramento: agrega todas as falhas ocorridas
 * (servidor HTTP + módulos) num único erro explícito.
 */
export class ShutdownError extends Error {
  readonly errors: unknown[];

  constructor(errors: unknown[]) {
    super(`[bootstrap] shutdown failed with ${errors.length} error(s)`);
    this.name = "ShutdownError";
    this.errors = errors;
  }
}

function closeAll(server: Server): void {
  const withConnections = server as Server & {
    closeAllConnections?: () => void;
  };
  withConnections.closeAllConnections?.();
}

/**
 * Fecha o servidor HTTP: deixa de aceitar ligações novas,
 * fecha as ociosas de imediato e espera pelas activas até ao
 * limite `timeoutMs`. Ao expirar, força o fecho e REJEITA —
 * o chamador é obrigado a tratar a falha.
 */
export function closeHttpServer(
  server: Server,
  timeoutMs = 10000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const timer = setTimeout(() => {
      closeAll(server);
      finish(new Error("HTTP shutdown timeout"));
    }, timeoutMs);

    timer.unref?.();

    server.close((error?: Error) => {
      if (error) {
        finish(error);
        return;
      }
      finish();
    });

    // Fecha keep-alive ociosas de imediato.
    const withIdle = server as Server & {
      closeIdleConnections?: () => void;
    };
    withIdle.closeIdleConnections?.();
  });
}

export function createShutdownHandler(
  options: ShutdownOptions,
): ShutdownFn {
  const { context, httpServer, getModules, timeoutMs = 10000 } = options;

  let shuttingDown = false;

  return async (reason: string): Promise<void> => {
    if (shuttingDown) {
      context.logger.warn(
        `[bootstrap] shutdown already in progress (ignored: ${reason})`,
      );
      return;
    }

    shuttingDown = true;

    const startedAt = Date.now();
    const errors: unknown[] = [];

    // BOOT-007 — evento de encerramento registado.
    context.logger.info(
      `[bootstrap] shutdown started (${reason}) — state=${context.lifecycle.state}`,
    );

    // BOOT-008 — novos pedidos passam a receber 503.
    context.lifecycle.beginDrain();

    // BOOT-008 — parar de aceitar ligações, concluir as em curso.
    if (httpServer) {
      try {
        await closeHttpServer(httpServer, timeoutMs);
        context.logger.info("[bootstrap] http server closed");
      } catch (error) {
        context.logger.warn("[bootstrap] http server close failed", error);
        errors.push(error);
      }
    }

    // BOOT-008 — módulos pela ordem inversa (falhas agregadas).
    errors.push(...(await shutdownModules(context, getModules?.() ?? [])));

    context.container.dispose();

    if (errors.length > 0) {
      context.lifecycle.markFailed();
      context.logger.error(
        `[bootstrap] shutdown finished with ${errors.length} error(s)`,
      );
      throw new ShutdownError(errors);
    }

    context.lifecycle.markStopped();

    context.logger.info(
      `[bootstrap] shutdown completed in ${Date.now() - startedAt}ms`,
    );
  };
}
