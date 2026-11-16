/**
 * ============================================================
 * SERVER — arranque e encerramento controlado
 * ============================================================
 *
 * Fluxo (§2.4 do plano):
 *
 *   validar ambiente → criar logger/contexto → ligar
 *   dependências → verificar prontidão → montar Express →
 *   iniciar HTTP → registar sinais.
 *
 * Nada disto corre ao ser importado: `startServer()` é
 * explícito, o que mantém os testes sem porta de rede.
 */

import { createServer, type Server } from 'http';

import type { Express } from 'express';

// Carrega os `.env` antes de qualquer validação (BOOT-001).
import '../config/env';

import { createConfig } from '../config';
import { logger } from '../config/logger';
import { validateSecurityConfig } from '../config/security';
import NotificationService from '../sockets/socket.server';

import { createApp, createApplicationContext } from './app';
import { defaultModules, initializeModules, shutdownModules } from './register-modules';
import { closeHttpServer, createShutdownHandler, type ShutdownFn } from './shutdown';

import type {
  ApplicationContext,
  BootstrapConfig,
  ModuleDefinition,
} from './types/application-context';

export interface StartServerOptions {
  /** Porta a ouvir. Por omissão, a do ambiente validado. */
  port?: number;

  /** Módulos a inicializar. Por omissão, os módulos reais. */
  modules?: ModuleDefinition[];

  /** Liga o Socket.io ao servidor HTTP (omissão: `true`). */
  initSockets?: boolean;

  /** Regista handlers de SIGTERM/SIGINT (omissão: `true`). */
  handleSignals?: boolean;

  /** Origens CORS. `true` reflete qualquer origem (apenas dev/test). */
  allowedOrigins?: string[] | true;

  /** Tempo máximo do encerramento gracioso. */
  shutdownTimeoutMs?: number;
}

export interface StartedServer {
  app: Express;
  httpServer: Server;
  context: ApplicationContext;
  shutdown: ShutdownFn;
}

function listen(server: Server, port: number, host?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);

    if (host) {
      server.listen(port, host);
    } else {
      server.listen(port);
    }
  });
}

function registerSignalHandlers(shutdown: ShutdownFn, timeoutMs: number): void {
  const handle = (signal: NodeJS.Signals) => {
    logger.info(`[bootstrap] ${signal} received — graceful shutdown`);

    // Rede de segurança: se o encerramento travar, sai à força.
    const forceExit = setTimeout(() => {
      logger.error('[bootstrap] shutdown timed out — forcing exit');
      process.exit(1);
    }, timeoutMs + 5000);

    forceExit.unref();

    shutdown(`signal:${signal}`)
      .then(() => {
        clearTimeout(forceExit);
        logger.info('[bootstrap] bye 👋');
        process.exit(0);
      })
      .catch((error) => {
        logger.error('[bootstrap] shutdown failed', error);
        process.exit(1);
      });
  };

  process.once('SIGTERM', handle);
  process.once('SIGINT', handle);
}

/**
 * Arranca a aplicação. Lança um erro controlado quando o
 * ambiente é inválido ou uma dependência crítica falha —
 * libertando primeiro tudo o que já tinha sido aberto.
 */
export async function startServer(options: StartServerOptions = {}): Promise<StartedServer> {
  // BOOT-001 — validar ANTES de tocar em qualquer recurso.
  // Módulo 02: a validação completa (Zod + regras de produção +
  // CORS) vive em `config/`; daqui só se projeta o que o
  // bootstrap precisa.
  validateSecurityConfig();
  const full = createConfig();

  const config: BootstrapConfig = {
    nodeEnv: full.app.env,
    port: full.app.port,
    host: full.app.host,
    jwtSecret: full.auth.jwt.secret,
    shutdownTimeoutMs: full.app.shutdownTimeoutMs,
  };

  const context = createApplicationContext({ config });
  const { lifecycle } = context;

  const port = options.port ?? config.port;
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? config.shutdownTimeoutMs;

  logger.info(`[bootstrap] starting "${config.nodeEnv}" on port ${port} (BOOT-001 ✓)`);

  const app = createApp({
    context,
    allowedOrigins: options.allowedOrigins ?? (full.cors.allowAnyOrigin ? true : full.cors.origins),
  });

  let initialized: ModuleDefinition[] = [];
  let httpServer: Server | undefined;

  try {
    lifecycle.markInitializing();

    // BOOT-002 — dependências obrigatórias antes do tráfego.
    initialized = await initializeModules(context, options.modules ?? defaultModules());

    // BOOT-004 — prontidão verificada antes de ouvir.
    const readiness = context.health.snapshot();
    if (readiness.status === 'down') {
      const down = readiness.checks
        .filter((check) => check.critical && check.status === 'down')
        .map((check) => check.name)
        .join(', ');

      throw new Error(`critical dependency unavailable: ${down}`);
    }

    httpServer = createServer(app);

    if (options.initSockets !== false) {
      NotificationService.initializeSocket(httpServer);
      logger.info('[bootstrap] socket.io initialized');
    }

    // BOOT-002 — só agora aceita ligações.
    await listen(httpServer, port, config.host);

    lifecycle.markReady();

    logger.info(`[bootstrap] ready on http://${config.host}:${port}`);
    logger.info(`[bootstrap] liveness  → GET /health`);
    logger.info(`[bootstrap] readiness → GET /health/ready`);

    const shutdown = createShutdownHandler({
      context,
      httpServer,
      getModules: () => initialized,
      timeoutMs: shutdownTimeoutMs,
    });

    if (options.handleSignals !== false) {
      registerSignalHandlers(shutdown, shutdownTimeoutMs);
    }

    return { app, httpServer, context, shutdown };
  } catch (error) {
    // BOOT-003 + BOOT-010 — falha controlada com rollback.
    logger.error('[bootstrap] startup failed', error);

    lifecycle.markFailed();

    if (httpServer) {
      await closeHttpServer(httpServer, 2000).catch(() => undefined);
    }

    await shutdownModules(context, initialized);

    context.container.dispose();
    lifecycle.markStopped();

    throw error;
  }
}
